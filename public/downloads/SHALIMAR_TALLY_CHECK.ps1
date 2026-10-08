# Shalimar Connect: local, read-only TallyPrime access check.
# No installation, credential, customer export, upload, scheduler or write-back.
# Windows PowerShell 5.1 / PowerShell 7. Run on the SAME PC as TallyPrime.
[CmdletBinding()]
param(
    [string]$ExpectedCompany = '',
    [string]$ReportedRelease = '',
    [int]$Port = 9000
)

function Read-ShalimarXml([string]$Text) {
    if ($null -eq $Text -or $Text.Length -gt 262144) { throw 'response_too_large' }
    $settings = New-Object System.Xml.XmlReaderSettings
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $settings.MaxCharactersInDocument = 262144
    $reader = $null
    $inputText = $null
    try {
        $inputText = New-Object System.IO.StringReader($Text)
        $reader = [System.Xml.XmlReader]::Create($inputText, $settings)
        $doc = New-Object System.Xml.XmlDocument
        $doc.XmlResolver = $null
        $doc.Load($reader)
        return ,$doc
    } catch { throw 'invalid_tally_xml' } finally {
        if ($null -ne $reader) { $reader.Dispose() }
        if ($null -ne $inputText) { $inputText.Dispose() }
    }
}

function New-ShalimarCompanyRequest([string]$Company) {
    if ([string]::IsNullOrWhiteSpace($Company) -or $Company.Length -gt 200 -or $Company -match '[\x00-\x1F\x7F]') {
        throw 'invalid_company'
    }
    $escaped = [System.Security.SecurityElement]::Escape($Company.Trim())
    # The only input is an XML text value. It is never inserted in a TDL formula.
    # Export Collection / Type Company; fetch identity only, with an exact-name filter.
    return @"
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ShalimarConnectionCompany</ID></HEADER>
  <BODY><DESC>
    <STATICVARIABLES><SVCURRENTCOMPANY>$escaped</SVCURRENTCOMPANY><SVEXPORTFORMAT>`$`$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
    <TDL><TDLMESSAGE>
      <COLLECTION NAME="ShalimarConnectionCompany" ISMODIFY="No">
        <TYPE>Company</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD><NATIVEMETHOD>GUID</NATIVEMETHOD><FILTER>ShalimarRequestedCompany</FILTER>
      </COLLECTION>
      <SYSTEM TYPE="Formulae" NAME="ShalimarRequestedCompany">`$Name = ##SVCurrentCompany</SYSTEM>
    </TDLMESSAGE></TDL>
  </DESC></BODY>
</ENVELOPE>
"@
}

function ConvertFrom-ShalimarCompanyResponse([string]$Response, [string]$Company) {
    $doc = Read-ShalimarXml $Response
    if ($doc.SelectNodes('//LINEERROR').Count -gt 0 -or $doc.SelectNodes('/ENVELOPE/HEADER/STATUS[text()="0"]').Count -gt 0) {
        throw 'tally_rejected_request'
    }
    if ($null -eq $doc.SelectSingleNode('/ENVELOPE')) { throw 'invalid_tally_response' }
    $companies = $doc.SelectNodes('/ENVELOPE/BODY/DATA/COLLECTION/COMPANY')
    if ($companies.Count -eq 0) { throw 'company_not_available' }
    if ($companies.Count -ne 1) { throw 'ambiguous_company_response' }
    $node = $companies[0]
    $actual = $node.GetAttribute('NAME')
    if ([string]::IsNullOrWhiteSpace($actual)) {
        $nameNode = $node.SelectSingleNode('NAME')
        if ($null -ne $nameNode) { $actual = $nameNode.InnerText }
    }
    if ($actual -cne $Company.Trim()) { throw 'wrong_company' }
    $identifier = $node.SelectSingleNode('GUID')
    if ($null -eq $identifier -or [string]::IsNullOrWhiteSpace($identifier.InnerText)) {
        throw 'missing_company_identifier'
    }
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($identifier.InnerText.Trim())
        $fingerprint = ([System.BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally { $hash.Dispose() }
    return [pscustomobject]@{ company = $actual; company_fingerprint = $fingerprint }
}

function Get-ShalimarTallyEndpoint([int]$LocalPort) {
    if ($LocalPort -lt 1 -or $LocalPort -gt 65535) { throw 'invalid_port' }
    # No remote host / public-IP option. No DNS lookup or network discovery.
    return [uri]("http://127.0.0.1:{0}/" -f $LocalPort)
}

function Invoke-ShalimarCompanyCheck([string]$Company, [int]$LocalPort = 9000) {
    $endpoint = Get-ShalimarTallyEndpoint $LocalPort
    $requestBody = New-ShalimarCompanyRequest $Company
    $response = $null
    $stream = $null
    $buffer = $null
    try {
        $request = [System.Net.HttpWebRequest]::Create($endpoint)
        $request.Method = 'POST'
        $request.ContentType = 'text/xml; charset=utf-8'
        $request.Accept = 'text/xml'
        $request.AllowAutoRedirect = $false
        $request.Proxy = $null
        $request.UseDefaultCredentials = $false
        $request.Timeout = 10000
        $request.ReadWriteTimeout = 10000
        $body = [System.Text.Encoding]::UTF8.GetBytes($requestBody)
        $request.ContentLength = $body.Length
        $requestStream = $request.GetRequestStream()
        try { $requestStream.Write($body, 0, $body.Length) } finally { $requestStream.Dispose() }
        $response = $request.GetResponse()
        if ([int]$response.StatusCode -ne 200) { throw 'unexpected_http_status' }
        if ($response.ContentLength -gt 262144) { throw 'response_too_large' }
        $stream = $response.GetResponseStream()
        $buffer = New-Object System.IO.MemoryStream
        $chunk = New-Object byte[] 4096
        $deadline = [datetime]::UtcNow.AddSeconds(10)
        while (($read = $stream.Read($chunk, 0, $chunk.Length)) -gt 0) {
            if ($buffer.Length + $read -gt 262144) { throw 'response_too_large' }
            if ([datetime]::UtcNow -gt $deadline) { throw 'local_request_failed' }
            $buffer.Write($chunk, 0, $read)
        }
        $buffer.Position = 0
        $reader = New-Object System.IO.StreamReader($buffer, [System.Text.Encoding]::UTF8, $true)
        try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
    } catch {
        # Never log raw XML, local service errors, paths, identifiers or credentials.
        if ($_.Exception.Message -in @('response_too_large', 'unexpected_http_status')) { throw $_.Exception.Message }
        throw 'local_request_failed'
    } finally {
        if ($null -ne $stream) { $stream.Dispose() }
        if ($null -ne $buffer) { $buffer.Dispose() }
        if ($null -ne $response) { $response.Dispose() }
    }
    return ConvertFrom-ShalimarCompanyResponse $text $Company
}

function Start-ShalimarTallyCheck {
    $ErrorActionPreference = 'Stop'
    Write-Host 'SHALIMAR: read-only local TallyPrime check. Nothing is uploaded.'
    if ([string]::IsNullOrWhiteSpace($ExpectedCompany)) {
        $ExpectedCompany = Read-Host 'Exact Shalimar company name shown in TallyPrime'
    }
    if ([string]::IsNullOrWhiteSpace($ReportedRelease)) {
        $ReportedRelease = Read-Host 'Release shown in TallyPrime F1 Help (not your licence number)'
    }
    if ($ReportedRelease.Length -gt 80 -or $ReportedRelease -match '[\x00-\x1F\x7F]') {
        Write-Host 'Please use only the short release/version from F1 Help.'
        return
    }
    $receipt = [ordered]@{
        check_version = 1
        checked_at_utc = [datetime]::UtcNow.ToString('o')
        status = 'blocked'
        company = $null
        company_fingerprint = $null
        reported_tally_release = $ReportedRelease.Trim()
        local_port = $Port
        crm_sync = 'not_connected'
        customer_data_uploaded = $false
        broadcasts_activated = $false
    }
    try {
        $result = Invoke-ShalimarCompanyCheck $ExpectedCompany $Port
        $receipt.status = 'company_read_verified'
        $receipt.company = $result.company
        $receipt.company_fingerprint = $result.company_fingerprint
        Write-Host 'Company read succeeded. This does not mean sales are synced to CRM.'
    } catch {
        $code = $_.Exception.Message
        $instructions = @{
            invalid_company = 'Enter the exact company name, maximum 200 characters, on one line.'
            invalid_port = 'Check the local HTTP port in Tally Help. Use a number from 1 to 65535.'
            local_request_failed = 'Keep Tally running and its company open. Ask the shop technician to check the LOCAL HTTP service. Do not open a router port or disable protection.'
            response_too_large = 'The local service returned more than this identity check permits. Stop and ask us to review the setup.'
            unexpected_http_status = 'The local service did not return success. Stop; do not follow redirects or change security settings.'
            invalid_tally_xml = 'The response was not safe, readable Tally XML. Stop and check the local service.'
            invalid_tally_response = 'This may be another program using the port. Check the Tally port shown in Help.'
            tally_rejected_request = 'Tally rejected the read. Keep the company open. Do not share a password; ask the shop technician to review access.'
            company_not_available = 'The requested company was not returned. Check its exact name and keep it open in Tally.'
            ambiguous_company_response = 'More than one company was returned. Stop so the company selection can be reviewed.'
            wrong_company = 'The returned company differs from the requested one. Stop and review the company selection.'
            missing_company_identifier = 'Tally did not supply a stable company identifier. The version and response format need review.'
        }
        if (-not $instructions.ContainsKey($code)) { $code = 'local_request_failed' }
        $receipt['error_code'] = $code
        Write-Host $instructions[$code]
    }
    Write-Host 'Copy only the result below back to the owner. No token, PIN or password is needed.'
    Write-Output ($receipt | ConvertTo-Json -Depth 3)
}

# Dot-sourcing loads functions for isolated tests; normal execution runs one check.
if ($MyInvocation.InvocationName -ne '.') { Start-ShalimarTallyCheck }
