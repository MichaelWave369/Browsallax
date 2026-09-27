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
