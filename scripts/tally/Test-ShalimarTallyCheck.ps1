# Run with PowerShell 7 or Windows PowerShell 5.1. Synthetic fixtures only.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../../public/downloads/SHALIMAR_TALLY_CHECK.ps1')
$script:Checks = 0
function Assert-Equal($Actual, $Expected, [string]$Label) {
    if ($Actual -cne $Expected) { throw "FAILED: $Label" }
    $script:Checks += 1
}
function Assert-Reject([scriptblock]$Action, [string]$Code) {
    $caught = $false
    try { & $Action | Out-Null } catch {
        $caught = $true
        Assert-Equal $_.Exception.Message $Code $Code
    }
    if (-not $caught) { throw "Expected rejection: $Code" }
}

$company = 'Synthetic & Company "A"'
$request = New-ShalimarCompanyRequest $company
$xml = Read-ShalimarXml $request
Assert-Equal $xml.ENVELOPE.HEADER.TALLYREQUEST 'Export' 'Only Export is permitted'
Assert-Equal $xml.ENVELOPE.HEADER.TYPE 'Collection' 'Only a company collection is requested'
Assert-Equal $xml.ENVELOPE.BODY.DESC.STATICVARIABLES.SVCURRENTCOMPANY $company 'Escaped company round trip'
Assert-Equal $xml.ENVELOPE.BODY.DESC.TDL.TDLMESSAGE.COLLECTION.TYPE 'Company' 'No sales or contacts are requested'
Assert-Equal ([string]::Join(',', @($xml.ENVELOPE.BODY.DESC.TDL.TDLMESSAGE.COLLECTION.NATIVEMETHOD))) 'Name,GUID' 'Only identity methods'
Assert-Equal $xml.ENVELOPE.BODY.DESC.TDL.TDLMESSAGE.SYSTEM.InnerText '$Name = ##SVCurrentCompany' 'Input is not executable TDL'
$injection = '</SVCURRENTCOMPANY><TALLYREQUEST>Import</TALLYREQUEST>'
Assert-Equal (Read-ShalimarXml (New-ShalimarCompanyRequest $injection)).ENVELOPE.BODY.DESC.STATICVARIABLES.SVCURRENTCOMPANY $injection 'XML injection remains text'
Assert-Reject { New-ShalimarCompanyRequest '   ' } 'invalid_company'
Assert-Reject { New-ShalimarCompanyRequest (('x' * 201)) } 'invalid_company'
Assert-Reject { New-ShalimarCompanyRequest "Company`nOther" } 'invalid_company'

$valid = '<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><COLLECTION><COMPANY NAME="Synthetic &amp; Company &quot;A&quot;"><GUID>fixture-company-guid</GUID></COMPANY></COLLECTION></DATA></BODY></ENVELOPE>'
$result = ConvertFrom-ShalimarCompanyResponse $valid $company
Assert-Equal $result.company $company 'Exact company matched'
Assert-Equal $result.company_fingerprint.Length 64 'Fingerprint available without exposing the identifier'
Assert-Equal $result.company_fingerprint (ConvertFrom-ShalimarCompanyResponse $valid $company).company_fingerprint 'Stable fingerprint'
Assert-Reject { ConvertFrom-ShalimarCompanyResponse $valid 'Other company' } 'wrong_company'
Assert-Reject { ConvertFrom-ShalimarCompanyResponse '<RESPONSE><LINEERROR>Private detail</LINEERROR></RESPONSE>' $company } 'tally_rejected_request'
Assert-Reject { ConvertFrom-ShalimarCompanyResponse '<ENVELOPE><HEADER><STATUS>0</STATUS></HEADER></ENVELOPE>' $company } 'tally_rejected_request'
Assert-Reject { ConvertFrom-ShalimarCompanyResponse '<ENVELOPE><BODY><DATA/></BODY></ENVELOPE>' $company } 'company_not_available'
Assert-Reject { ConvertFrom-ShalimarCompanyResponse ($valid.Replace('<GUID>fixture-company-guid</GUID>', '')) $company } 'missing_company_identifier'
Assert-Reject { ConvertFrom-ShalimarCompanyResponse ($valid.Replace('</COLLECTION>', '<COMPANY NAME="Other"><GUID>other-guid</GUID></COMPANY></COLLECTION>')) $company } 'ambiguous_company_response'
Assert-Reject { ConvertFrom-ShalimarCompanyResponse '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><ENVELOPE>&xxe;</ENVELOPE>' $company } 'invalid_tally_xml'
Assert-Reject { ConvertFrom-ShalimarCompanyResponse '<html>Some other local app</html>' $company } 'invalid_tally_response'
Assert-Reject { Read-ShalimarXml ('x' * 262145) } 'response_too_large'
Assert-Reject { Read-ShalimarXml '<ENVELOPE>' } 'invalid_tally_xml'
Assert-Equal (Get-ShalimarTallyEndpoint 9000).AbsoluteUri 'http://127.0.0.1:9000/' 'Loopback only'
Assert-Reject { Get-ShalimarTallyEndpoint 0 } 'invalid_port'
Assert-Reject { Get-ShalimarTallyEndpoint 65536 } 'invalid_port'

$nameElement = '<ENVELOPE><BODY><DATA><COLLECTION><COMPANY><NAME>Synthetic &amp; Company "A"</NAME><GUID>fixture-company-guid</GUID></COMPANY></COLLECTION></DATA></BODY></ENVELOPE>'
Assert-Equal (ConvertFrom-ShalimarCompanyResponse $nameElement $company).company $company 'Name element variant'
Write-Output "$script:Checks checks passed. No connection to Tally, CRM or Meta was made."
