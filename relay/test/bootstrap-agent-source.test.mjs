import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(here, "../scripts/bootstrap-agent.ps1");
const source = fs.readFileSync(scriptPath, "utf8");

test("Windows bootstrap uses PowerShell 5.1-compatible cryptography APIs", () => {
  assert.match(source, /RandomNumberGenerator\]::Create\(\)/);
  assert.match(source, /\.GetBytes\(\$bytes\)/);
  assert.match(source, /BitConverter\]::ToString\(\$bytes\)/);
  assert.doesNotMatch(source, /RandomNumberGenerator\]::Fill\(/);
  assert.doesNotMatch(source, /Convert\]::ToHexString\(/);
});

test("Windows bootstrap never prints the generated agent token", () => {
  assert.doesNotMatch(source, /Write-Host[^\r\n]*\$token/i);
  assert.doesNotMatch(source, /Write-Output[^\r\n]*\$token/i);
});

test("Windows bootstrap rotates the agent secret in Netlify production context", () => {
  assert.match(
    source,
    /netlify\s+env:set\s+PHI_AGENT_TOKEN\s+\$token\s+--secret\s+--context\s+production/i
  );
});

test("Windows bootstrap preflights the local Browser Operator before rotating secrets", () => {
  const preflightIndex = source.indexOf("preflight-local-operator.mjs");
  const secretIndex = source.indexOf("netlify env:set PHI_AGENT_TOKEN");
  assert.ok(preflightIndex >= 0, "preflight command missing");
  assert.ok(secretIndex >= 0, "secret rotation command missing");
  assert.ok(preflightIndex < secretIndex, "local operator preflight must occur before secret rotation");
});

test("Windows bootstrap forces non-interactive Netlify agent secret rotation", () => {
  assert.match(
    source,
    /netlify\s+env:set\s+PHI_AGENT_TOKEN\s+\$token\s+--secret\s+--context\s+production\s+--force/i
  );
});

test("Windows bootstrap persists the agent credential through PowerShell secure strings", () => {
  assert.match(source, /ConvertFrom-SecureString/);
  assert.match(source, /ConvertTo-SecureString/);
  assert.match(source, /SecureStringToBSTR/);
  assert.match(source, /ZeroFreeBSTR/);
  assert.doesNotMatch(source, /ProtectedData\]::Protect\(/);
  assert.doesNotMatch(source, /ProtectedData\]::Unprotect\(/);
  assert.match(source, /agent-token\.dpapi/);
});

test("ordinary bootstrap reuses the protected credential instead of rotating every start", () => {
  assert.match(source, /\$provision\s*=\s*\$Rotate\s+-or\s+-not\s*\(Test-Path/);
  assert.match(source, /Loading existing DPAPI-protected agent credential/);
});

test("credential provisioning redeploys before persisting the new local credential", () => {
  const envIndex = source.indexOf("netlify env:set PHI_AGENT_TOKEN");
  const deployIndex = source.indexOf("npm run deploy:prod");
  const writeIndex = source.indexOf("WriteAllText($CredentialFile");
  assert.ok(envIndex >= 0, "remote secret update missing");
  assert.ok(deployIndex > envIndex, "production deploy must follow remote secret update");
  assert.ok(writeIndex > deployIndex, "local credential must persist only after successful deploy");
});
