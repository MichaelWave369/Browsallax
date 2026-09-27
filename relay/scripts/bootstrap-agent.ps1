param(
  [switch]$Rotate
)

$ErrorActionPreference = 'Stop'

$RelayUrl = 'https://phi-browsallax-relay.netlify.app'
$CredentialDir = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'browsallax\relay'
$CredentialFile = Join-Path $CredentialDir 'agent-token.dpapi'

function New-AgentToken {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
    return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
  }
  finally {
    if ($null -ne $rng) {
      $rng.Dispose()
    }
    [Array]::Clear($bytes, 0, $bytes.Length)
  }
}

function Protect-AgentToken([string]$Token) {
  $plain = [System.Text.Encoding]::UTF8.GetBytes($Token)
  try {
    $protected = [System.Security.Cryptography.ProtectedData]::Protect(
      $plain,
      $null,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    return [Convert]::ToBase64String($protected)
  }
  finally {
    [Array]::Clear($plain, 0, $plain.Length)
  }
}

function Unprotect-AgentToken([string]$Encoded) {
  $protected = [Convert]::FromBase64String($Encoded)
  $plain = $null
  try {
    $plain = [System.Security.Cryptography.ProtectedData]::Unprotect(
      $protected,
      $null,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    return [System.Text.Encoding]::UTF8.GetString($plain)
  }
  finally {
    [Array]::Clear($protected, 0, $protected.Length)
    if ($null -ne $plain) {
      [Array]::Clear($plain, 0, $plain.Length)
    }
  }
}

Write-Host '[Phi Relay Bootstrap] Checking local Browsallax Browser Operator...'
& node scripts/preflight-local-operator.mjs
if ($LASTEXITCODE -ne 0) {
  throw 'BROWSALLAX_LOCAL_OPERATOR_PREFLIGHT_FAILED'
}

$token = $null
$provision = $Rotate -or -not (Test-Path -LiteralPath $CredentialFile)

if ($provision) {
  if ($Rotate) {
    Write-Host '[Phi Relay Bootstrap] Explicit agent credential rotation requested.'
  }
  else {
    Write-Host '[Phi Relay Bootstrap] No local agent credential found; provisioning one now.'
  }

  $token = New-AgentToken

  Write-Host '[Phi Relay Bootstrap] Updating the production PHI_AGENT_TOKEN without printing it...'
  & npx netlify env:set PHI_AGENT_TOKEN $token --secret --context production --force
  if ($LASTEXITCODE -ne 0) {
    throw 'NETLIFY_AGENT_TOKEN_UPDATE_FAILED'
  }

  Write-Host '[Phi Relay Bootstrap] Redeploying relay so production Functions receive the new credential...'
  & npm run deploy:prod
  if ($LASTEXITCODE -ne 0) {
    throw 'NETLIFY_RELAY_DEPLOY_FAILED'
  }

  New-Item -ItemType Directory -Force -Path $CredentialDir | Out-Null
  $protectedToken = Protect-AgentToken $token
  [System.IO.File]::WriteAllText($CredentialFile, $protectedToken, [System.Text.Encoding]::UTF8)
  $protectedToken = $null
  Write-Host '[Phi Relay Bootstrap] Agent credential provisioned and protected with Windows DPAPI.'
}
else {
  Write-Host '[Phi Relay Bootstrap] Loading existing DPAPI-protected agent credential.'
  try {
    $encoded = [System.IO.File]::ReadAllText($CredentialFile, [System.Text.Encoding]::UTF8).Trim()
    $token = Unprotect-AgentToken $encoded
  }
  catch {
    throw 'LOCAL_AGENT_CREDENTIAL_UNPROTECT_FAILED'
  }

  if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 32) {
    throw 'LOCAL_AGENT_CREDENTIAL_INVALID'
  }
}

$env:PHI_CHATGPT_RELAY_URL = $RelayUrl
$env:PHI_CHATGPT_RELAY_AGENT_TOKEN = $token

Write-Host '[Phi Relay Bootstrap] Starting PV-CBR-AGENT-0.1.'
Write-Host '[Phi Relay Bootstrap] The agent credential is not printed and remains user-protected at rest.'

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
}
