$ErrorActionPreference = 'Stop'
Write-Host 'Shalimar Tally CRM sync (read-only Tally access)'
$env:TALLY_RELEASE = Read-Host 'Tally release (for example 7.1)'
$env:TALLY_PERIOD_START = Read-Host 'Closed period start (YYYY-MM-DD)'
$env:TALLY_PERIOD_END = Read-Host 'Closed period end (YYYY-MM-DD)'
$secure = Read-Host 'Paste the CRM tally:sync key (hidden)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:CRM_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr); node (Join-Path $PSScriptRoot 'dist\cli.js') }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); Remove-Item Env:CRM_API_KEY -ErrorAction SilentlyContinue }
