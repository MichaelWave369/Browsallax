import { useState } from 'react';

const TOOLS = [
  { id: 'research', label: 'Research', mark: 'R', kind: 'internal', view: 'research', note: 'Session-based investigations' },
  { id: 'ledger', label: 'Reality Ledger', mark: '◇', kind: 'internal', view: 'ledger', note: 'Local evidence receipts' },
  { id: 'workspaces', label: 'Workspaces', mark: 'W', kind: 'internal', view: 'workspaces', note: 'Saved links by project' },
  { id: 'phioffice', label: 'PhiOffice369', mark: 'Φ', kind: 'external', url: 'https://michaelwave369.github.io/phioffice369/', note: 'Free local-first productivity suite' },
  { id: 'field', label: 'Enter the Field', mark: '◎', kind: 'external', url: 'https://www.enterthefield.org/network/?entry=card', note: 'More free tools and projects' },
  { id: 'source', label: 'Browsallax Source', mark: '<>', kind: 'external', url: 'https://github.com/MichaelWave369/Browsallax', note: 'MIT source and roadmap' }
];

const FIELD_PRODUCTS_URL = 'https://field-supply-369.netlify.app/';

export default function ToolsDock({ currentView, onNavigate, openExternal }) {
  const [open, setOpen] = useState(true);

  return (
    <aside className={`tools-dock ${open ? 'open' : 'closed'}`} aria-label="Browsallax tools dock">
      <button className="tools-dock-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="tools-dock-logo">B</span>
        {open && <span><strong>FREE TOOLS</strong><small>Browsallax Dock</small></span>}
        <span className="tools-dock-chevron">{open ? '›' : '‹'}</span>
      </button>

      {open && (
        <div className="tools-dock-list">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              className={`tool-dock-item ${tool.kind === 'internal' && currentView === tool.view ? 'active' : ''}`}
              onClick={() => tool.kind === 'internal' ? onNavigate(tool.view) : openExternal(tool.url)}
            >
              <span className="tool-mark">{tool.mark}</span>
              <span className="tool-copy">
                <strong>{tool.label}</strong>
                <small>{tool.note}</small>
              </span>
              <span className="tool-arrow">{tool.kind === 'external' ? '↗' : '→'}</span>
            </button>
          ))}

          <p className="eyebrow" style={{ margin: '14px 10px 6px', fontSize: '.62rem' }}>FIELD PRODUCTS · PAID</p>
          <button
            className="tool-dock-item"
            onClick={() => openExternal(FIELD_PRODUCTS_URL)}
            aria-label="Open Field Supply paid products"
          >
            <span className="tool-mark">$</span>
            <span className="tool-copy">
              <strong>Field Supply</strong>
              <small>RackMap and other paid field products</small>
            </span>
            <span className="tool-arrow">↗</span>
          </button>
        </div>
      )}
    </aside>
  );
}
