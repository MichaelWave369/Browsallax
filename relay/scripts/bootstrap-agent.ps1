$ErrorActionPreference = 'Stop'

$RelayUrl = 'https://phi-browsallax-relay.netlify.app'

Write-Host '[Phi Relay Bootstrap] Checking local Browsallax Browser Operator...'
& node scripts/preflight-local-operator.mjs
if ($LASTEXITCODE -ne 0) {
  throw 'BROWSALLAX_LOCAL_OPERATOR_PREFLIGHT_FAILED'
}

Write-Host '[Phi Relay Bootstrap] Generating a fresh local agent credential...'

# Windows PowerShell 5.1 runs on .NET Framework and does not provide
# RandomNumberGenerator.Fill() or Convert.ToHexString(). Use APIs available
# across Windows PowerShell 5.1 and modern PowerShell.
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $rng.GetBytes($bytes)
}
finally {
  if ($null -ne $rng) {
    $rng.Dispose()
  }
}
$token = ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()

Write-Host '[Phi Relay Bootstrap] Rotating PHI_AGENT_TOKEN on Netlify without printing it...'
& npx netlify env:set PHI_AGENT_TOKEN $token --secret --context production --force
if ($LASTEXITCODE -ne 0) {
  throw 'NETLIFY_AGENT_TOKEN_UPDATE_FAILED'
}

$env:PHI_CHATGPT_RELAY_URL = $RelayUrl
$env:PHI_CHATGPT_RELAY_AGENT_TOKEN = $token

Write-Host '[Phi Relay Bootstrap] Starting PV-CBR-AGENT-0.1.'
Write-Host '[Phi Relay Bootstrap] The agent token is held only in this process environment and is not printed.'

Push-Location (Join-Path $PSScriptRoot '..\..')
try {
  & npm run bridge:relay-agent
  if ($LASTEXITCODE -ne 0) {
    throw "RELAY_AGENT_EXITED_$LASTEXITCODE"
  }
}
finally {
  Pop-Location
  Remove-Item Env:PHI_CHATGPT_RELAY_AGENT_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:PHI_CHATGPT_RELAY_URL -ErrorAction SilentlyContinue
  $token = $null
  [Array]::Clear($bytes, 0, $bytes.Length)
}
