param(
  [string]$Repository = $(if ($env:PHI_GITHUB_BRIDGE_REPO) { $env:PHI_GITHUB_BRIDGE_REPO } else { 'MichaelWave369/browsallax-chat-bridge' })
)

$ErrorActionPreference = 'Stop'
$MailboxDir = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'browsallax\github-bridge\mailbox'
$RepoUrl = "https://github.com/$Repository.git"

Write-Host '[Phi GitHub Bridge] Checking local Browsallax Browser Operator...'
Push-Location (Join-Path $PSScriptRoot '..')
try {
  & node relay/scripts/preflight-local-operator.mjs
  if ($LASTEXITCODE -ne 0) {
    throw 'BROWSALLAX_LOCAL_OPERATOR_PREFLIGHT_FAILED'
  }
}
finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath (Join-Path $MailboxDir '.git'))) {
  if (Test-Path -LiteralPath $MailboxDir) {
    throw 'GITHUB_BRIDGE_MAILBOX_EXISTS_BUT_IS_NOT_A_GIT_REPOSITORY'
  }

  Write-Host "[Phi GitHub Bridge] Cloning private mailbox $Repository..."
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $MailboxDir) | Out-Null
  & git clone --branch main --single-branch $RepoUrl $MailboxDir
  if ($LASTEXITCODE -ne 0) {
    throw 'GITHUB_BRIDGE_CLONE_FAILED'
  }
}
else {
  Write-Host '[Phi GitHub Bridge] Reusing existing local mailbox clone.'
}

$env:PHI_GITHUB_BRIDGE_REPO = $Repository
$env:PHI_GITHUB_BRIDGE_DIR = $MailboxDir
$env:PHI_GITHUB_BRIDGE_BRANCH = 'main'

Push-Location (Join-Path $PSScriptRoot '..')
try {
  & npm run bridge:github-agent
  if ($LASTEXITCODE -ne 0) {
    throw "GITHUB_BRIDGE_AGENT_EXITED_$LASTEXITCODE"
  }
}
finally {
  Pop-Location
  Remove-Item Env:PHI_GITHUB_BRIDGE_REPO -ErrorAction SilentlyContinue
  Remove-Item Env:PHI_GITHUB_BRIDGE_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:PHI_GITHUB_BRIDGE_BRANCH -ErrorAction SilentlyContinue
}
