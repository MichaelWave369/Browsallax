$ErrorActionPreference = 'Stop'

$RelayUrl = 'https://phi-browsallax-relay.netlify.app'

Write-Host '[Phi Relay Bootstrap] Generating a fresh local agent credential...'

$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$token = [Convert]::ToHexString($bytes).ToLowerInvariant()

Write-Host '[Phi Relay Bootstrap] Rotating PHI_AGENT_TOKEN on Netlify without printing it...'
& npx netlify env:set PHI_AGENT_TOKEN $token --secret
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
