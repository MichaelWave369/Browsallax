import { useEffect, useMemo, useState } from 'react';

const START_LINKS = [
  { label: 'DuckDuckGo', url: 'https://duckduckgo.com/', note: 'Search without the usual surveillance carnival.' },
  { label: 'Wikipedia', url: 'https://www.wikipedia.org/', note: 'Reference and jumping-off point.' },
  { label: 'GitHub', url: 'https://github.com/', note: 'Code, projects, issues, releases.' },
  { label: 'Internet Archive', url: 'https://archive.org/', note: 'Old web, books, software, media.' },
  { label: 'RackMap', url: 'https://rackmap-369.netlify.app/', note: 'Open the free RackMap network tool.' },
  { label: 'Browsallax Repo', url: 'https://github.com/MichaelWave369/Browsallax', note: 'Source, issues, roadmap, MIT license.' }
];

const DEFAULT_WORKSPACES = [
  { id: 'research', name: 'Research', links: [] },
  { id: 'build', name: 'Build', links: [] },
  { id: 'network', name: 'Network', links: [] }
];

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function resolveDestination(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'https://duckduckgo.com/';

  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {}

  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(value)) {
    return `https://${value}`;
  }

  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

export default function App() {
  const [view, setView] = useState('home');
  const [query, setQuery] = useState('');
  const [workspaces, setWorkspaces] = useLocalStorage('browsallax.workspaces.v1', DEFAULT_WORKSPACES);
  const [ledger, setLedger] = useLocalStorage('browsallax.ledger.v1', []);
  const [workspaceName, setWorkspaceName] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [workspaceId, setWorkspaceId] = useState(DEFAULT_WORKSPACES[0].id);
  const [ledgerTitle, setLedgerTitle] = useState('');
  const [ledgerSource, setLedgerSource] = useState('');
  const [ledgerText, setLedgerText] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [status, setStatus] = useState('Local-first web companion');

  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const linkCount = useMemo(
    () => workspaces.reduce((total, workspace) => total + workspace.links.length, 0),
    [workspaces]
  );

  function open(raw) {
    const url = resolveDestination(raw);
    window.open(url, '_blank', 'noopener,noreferrer');
    setStatus(`Opened ${new URL(url).hostname}`);
  }

  function submitOmnibox(event) {
    event.preventDefault();
    open(query);
  }

  function addWorkspace(event) {
    event.preventDefault();
    const name = workspaceName.trim();
    if (!name) return;
    const id = `${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workspace'}`;
    setWorkspaces((items) => [...items, { id, name, links: [] }]);
    setWorkspaceName('');
    setWorkspaceId(id);
    setStatus(`Workspace created: ${name}`);
  }

  function addWorkspaceLink(event) {
    event.preventDefault();
    const url = resolveDestination(linkUrl);
    const title = linkTitle.trim() || new URL(url).hostname;
    setWorkspaces((items) =>
      items.map((workspace) =>
        workspace.id === workspaceId
          ? { ...workspace, links: [...workspace.links, { id: crypto.randomUUID(), title, url }] }
          : workspace
      )
    );
    setLinkTitle('');
    setLinkUrl('');
    setStatus(`Saved ${title}`);
  }

  function removeWorkspaceLink(targetWorkspaceId, linkId) {
    setWorkspaces((items) =>
      items.map((workspace) =>
        workspace.id === targetWorkspaceId
          ? { ...workspace, links: workspace.links.filter((link) => link.id !== linkId) }
          : workspace
      )
    );
  }

  async function addLedgerReceipt(event) {
    event.preventDefault();
    const evidence = ledgerText.trim();
    if (!evidence) return;

    const receipt = {
      schema: 'browsallax.reality-ledger.web.v1',
      id: crypto.randomUUID(),
      authority: 'SOURCE_ONLY',
      capturedAt: new Date().toISOString(),
      title: ledgerTitle.trim() || 'Untitled observation',
      source: ledgerSource.trim() || null,
      evidence,
      sha256: await sha256(evidence),
      derived: false
    };

    setLedger((items) => [receipt, ...items]);
    setLedgerTitle('');
    setLedgerSource('');
    setLedgerText('');
    setStatus('Reality Ledger receipt captured locally');
  }

  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView('home')} aria-label="Browsallax home">
          <span className="brand-mark">B</span>
          <span>
            <strong>BROWSALLAX</strong>
            <small>WEB</small>
          </span>
        </button>

        <nav className="nav-tabs" aria-label="Primary navigation">
          {['home', 'workspaces', 'ledger'].map((item) => (
            <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>

        <div className="top-actions">
          {installPrompt && <button className="ghost-button" onClick={installApp}>Install PWA</button>}
          <a className="ghost-button" href="https://github.com/MichaelWave369/Browsallax" target="_blank" rel="noreferrer">Source</a>
        </div>
      </header>

      <main>
        {view === 'home' && (
          <>
            <section className="hero panel-grid">
              <div className="hero-copy">
                <p className="eyebrow">FREE · MIT · LOCAL-FIRST</p>
                <h1>Browse beyond the page.</h1>
                <p className="lede">
                  Browsallax Web is the zero-install companion to the desktop browser: a private launchpad,
                  research workspace, and local evidence notebook that lives in your browser.
                </p>

                <form className="omnibox" onSubmit={submitOmnibox}>
                  <span className="omnibox-icon">⌕</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search the web or enter a URL"
                    aria-label="Search the web or enter a URL"
                  />
                  <button type="submit">OPEN</button>
                </form>
                <p className="privacy-line">Searches open in a normal browser tab. Browsallax Web does not proxy or inspect them.</p>
              </div>

              <aside className="instrument-card">
                <div className="instrument-head"><span>LOCAL STATUS</span><span className="live-dot">LIVE</span></div>
                <dl>
                  <div><dt>Account</dt><dd>Not required</dd></div>
                  <div><dt>Workspace data</dt><dd>Local storage</dd></div>
                  <div><dt>Ledger receipts</dt><dd>{ledger.length}</dd></div>
                  <div><dt>Saved links</dt><dd>{linkCount}</dd></div>
                  <div><dt>Cloud AI</dt><dd>Not required</dd></div>
                </dl>
              </aside>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div><p className="eyebrow">QUICK LAUNCH</p><h2>Useful places, one clean panel.</h2></div>
                <span className="section-note">External pages open separately by design.</span>
              </div>
              <div className="launch-grid">
                {START_LINKS.map((link, index) => (
                  <button className="launch-card" key={link.url} onClick={() => open(link.url)}>
                    <span className="launch-index">0{index + 1}</span>
                    <strong>{link.label}</strong>
                    <p>{link.note}</p>
                    <span className="launch-arrow">↗</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="split-section">
              <article className="info-panel">
                <p className="eyebrow">WHAT THIS IS</p>
                <h2>A web companion, not a fake browser inside a browser.</h2>
                <p>
                  Websites can block framing and browsers enforce same-origin security. Browsallax Web respects that boundary.
                  It launches destinations normally while keeping your workspaces and evidence receipts local to this app.
                </p>
              </article>
              <article className="info-panel accent-panel">
                <p className="eyebrow">DESKTOP EDITION</p>
                <h2>Need tabs, page capture, permissions, and local AI?</h2>
                <p>The Electron edition carries the deeper browser capabilities that a GitHub Pages app cannot safely obtain.</p>
                <a href="https://github.com/MichaelWave369/Browsallax" target="_blank" rel="noreferrer">View desktop source ↗</a>
              </article>
            </section>
          </>
        )}

        {view === 'workspaces' && (
          <section className="page-section">
            <div className="section-heading">
              <div><p className="eyebrow">LOCAL WORKSPACES</p><h1>Keep research from becoming 74 mystery tabs.</h1></div>
              <span className="section-note">Stored only in this browser profile.</span>
            </div>

            <div className="workspace-controls">
              <form className="compact-form" onSubmit={addWorkspace}>
                <label>New workspace</label>
                <div><input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Physics, Client A, Weird Ideas..." /><button>Add</button></div>
              </form>
              <form className="compact-form" onSubmit={addWorkspaceLink}>
                <label>Save a link</label>
                <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
                <div className="two-inputs">
                  <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Title" />
                  <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="URL or search" required />
                </div>
                <button>Save to workspace</button>
              </form>
            </div>

            <div className="workspace-grid">
              {workspaces.map((workspace) => (
                <article className="workspace-card" key={workspace.id}>
                  <header><h2>{workspace.name}</h2><span>{workspace.links.length} links</span></header>
                  {workspace.links.length === 0 ? <p className="empty-state">Nothing saved yet.</p> : (
                    <ul>
                      {workspace.links.map((link) => (
                        <li key={link.id}>
                          <button className="saved-link" onClick={() => open(link.url)}>
                            <strong>{link.title}</strong><small>{new URL(link.url).hostname}</small>
                          </button>
                          <button className="delete-button" onClick={() => removeWorkspaceLink(workspace.id, link.id)} aria-label={`Remove ${link.title}`}>×</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {view === 'ledger' && (
          <section className="page-section">
            <div className="section-heading">
              <div><p className="eyebrow">REALITY LEDGER · WEB</p><h1>Capture evidence without pretending it became truth.</h1></div>
              <button className="ghost-button" disabled={!ledger.length} onClick={() => downloadJson('browsallax-reality-ledger.json', ledger)}>Export JSON</button>
            </div>

            <div className="ledger-layout">
              <form className="ledger-form" onSubmit={addLedgerReceipt}>
                <label>Title<input value={ledgerTitle} onChange={(e) => setLedgerTitle(e.target.value)} placeholder="What are you capturing?" /></label>
                <label>Source URL<input value={ledgerSource} onChange={(e) => setLedgerSource(e.target.value)} placeholder="https://... (optional)" /></label>
                <label>Observed text<textarea value={ledgerText} onChange={(e) => setLedgerText(e.target.value)} placeholder="Paste or type the exact observation here." required rows="9" /></label>
                <button className="primary-button">Create local receipt</button>
                <p className="form-note">Receipts are stamped SOURCE_ONLY and SHA-256 hashed. A hash preserves integrity; it does not certify truth.</p>
              </form>

              <div className="receipt-list">
                {ledger.length === 0 ? (
                  <div className="empty-ledger"><span>◇</span><h2>No receipts yet.</h2><p>The universe remains temporarily undocumented.</p></div>
                ) : ledger.map((receipt) => (
                  <article className="receipt" key={receipt.id}>
                    <header><strong>{receipt.title}</strong><span>{receipt.authority}</span></header>
                    <p>{receipt.evidence}</p>
                    <dl>
                      <div><dt>Captured</dt><dd>{new Date(receipt.capturedAt).toLocaleString()}</dd></div>
                      {receipt.source && <div><dt>Source</dt><dd><a href={receipt.source} target="_blank" rel="noreferrer">{receipt.source}</a></dd></div>}
                      <div><dt>SHA-256</dt><dd className="hash">{receipt.sha256}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer>
        <span>{status}</span>
        <span>Browsallax Web v0.1.0-alpha.1 · MIT</span>
      </footer>
    </div>
  );
}
