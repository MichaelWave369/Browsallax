const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readWeb = (filename) => fs.readFileSync(
  path.join(__dirname, '..', 'web', 'src', filename),
  'utf8'
);

test('Browsallax Web has no broken Field launchers or paid product promotion', () => {
  for (const filename of ['App.jsx', 'ToolsDock.jsx']) {
    const source = readWeb(filename);
    assert.doesNotMatch(
      source,
      /Enter the Field|enterthefield\.org\/network|Field Supply|field-supply-369\.netlify\.app|FIELD PRODUCTS|FIELD_PRODUCTS_URL/i,
      filename
    );
  }
});

test('Quick Launch retains five active destinations after the broken link is removed', () => {
  const source = readWeb('App.jsx');
  const links = source.match(/const START_LINKS = \[([\s\S]*?)\];/);
  assert.ok(links, 'START_LINKS must remain declared');
  assert.equal((links[1].match(/\{ label:/g) || []).length, 5);
  for (const destination of ['DuckDuckGo', 'Wikipedia', 'GitHub', 'Internet Archive', 'PhiOffice369']) {
    assert.match(links[1], new RegExp("label: '" + destination + "'"));
  }
});

test('Free Tools Dock still exposes research and free project links', () => {
  const source = readWeb('ToolsDock.jsx');
  for (const id of ['research', 'ledger', 'workspaces', 'lwg', 'phioffice', 'source']) {
    assert.match(source, new RegExp("id: '" + id + "'"));
  }
  assert.match(source, /FREE TOOLS/);
});
