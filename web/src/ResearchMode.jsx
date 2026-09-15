import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'browsallax.research.v1';

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

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function ResearchMode({ openExternal, captureEvidence, setStatus }) {
  const [sessions, setSessions] = useLocalStorage(STORAGE_KEY, []);
  const [activeId, setActiveId] = useState(() => sessions[0]?.id || null);
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [noteText, setNoteText] = useState('');
  const [questionText, setQuestionText] = useState('');

  useEffect(() => {
    if (!activeId && sessions[0]) setActiveId(sessions[0].id);
    if (activeId && !sessions.some((session) => session.id === activeId)) {
      setActiveId(sessions[0]?.id || null);
    }
  }, [sessions, activeId]);

  const active = useMemo(
    () => sessions.find((session) => session.id === activeId) || null,
    [sessions, activeId]
  );

  const totals = useMemo(
    () => sessions.reduce(
      (acc, session) => ({
        sources: acc.sources + session.sources.length,
        notes: acc.notes + session.notes.length,
        questions: acc.questions + session.questions.filter((item) => !item.resolved).length
      }),
      { sources: 0, notes: 0, questions: 0 }
    ),
    [sessions]
  );

  function updateActive(mutator) {
    if (!activeId) return;
    setSessions((items) => items.map((session) => (
      session.id === activeId ? mutator(session) : session
    )));
  }

  function createSession(event) {
    event.preventDefault();
    const name = title.trim();
    if (!name) return;

    const session = {
      schema: 'browsallax.research.session.v1',
      id: crypto.randomUUID(),
      title: name,
      question: question.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sources: [],
      notes: [],
      questions: []
    };

    setSessions((items) => [session, ...items]);
    setActiveId(session.id);
    setTitle('');
    setQuestion('');
    setStatus?.(`Research session created: ${name}`);
  }

  function addSource(event) {
    event.preventDefault();
    if (!active) return;
    const raw = sourceUrl.trim();
    if (!raw) return;

    let url = raw;
    try {
      url = new URL(raw).toString();
    } catch {
      url = `https://${raw}`;
    }

    let label = sourceTitle.trim();
    if (!label) label = safeHostname(url);

    updateActive((session) => ({
      ...session,
      updatedAt: new Date().toISOString(),
      sources: [
        ...session.sources,
        {
          id: crypto.randomUUID(),
          title: label,
          url,
          note: sourceNote.trim(),
          addedAt: new Date().toISOString()
        }
      ]
    }));

    setSourceTitle('');
    setSourceUrl('');
    setSourceNote('');
    setStatus?.(`Source added: ${label}`);
  }

  function addNote(event) {
    event.preventDefault();
    const text = noteText.trim();
    if (!active || !text) return;

    updateActive((session) => ({
      ...session,
      updatedAt: new Date().toISOString(),
      notes: [
        { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() },
        ...session.notes
      ]
    }));
    setNoteText('');
    setStatus?.('Research note saved locally');
  }

  function addQuestion(event) {
    event.preventDefault();
    const text = questionText.trim();
    if (!active || !text) return;

    updateActive((session) => ({
      ...session,
      updatedAt: new Date().toISOString(),
      questions: [
        ...session.questions,
        { id: crypto.randomUUID(), text, resolved: false, createdAt: new Date().toISOString() }
      ]
    }));
    setQuestionText('');
    setStatus?.('Unresolved question added');
  }

  function toggleQuestion(id) {
    updateActive((session) => ({
      ...session,
      updatedAt: new Date().toISOString(),
      questions: session.questions.map((item) => (
        item.id === id ? { ...item, resolved: !item.resolved } : item
      ))
    }));
  }

  function removeSource(id) {
    updateActive((session) => ({
      ...session,
      updatedAt: new Date().toISOString(),
      sources: session.sources.filter((source) => source.id !== id)
    }));
  }

  function removeNote(id) {
    updateActive((session) => ({
      ...session,
      updatedAt: new Date().toISOString(),
      notes: session.notes.filter((note) => note.id !== id)
    }));
  }

  async function ledgerNote(note) {
    if (!active) return;
    await captureEvidence({
      title: `${active.title}: research note`,
      source: null,
      evidence: note.text,
      context: {
        researchSessionId: active.id,
        researchSessionTitle: active.title,
        noteId: note.id
      }
    });
    setStatus?.('Research note preserved in Reality Ledger');
  }

  async function ledgerSource(source) {
    if (!active) return;
    const evidence = source.note || `Source recorded for research session: ${source.title}`;
    await captureEvidence({
      title: `${active.title}: ${source.title}`,
      source: source.url,
      evidence,
      context: {
        researchSessionId: active.id,
        researchSessionTitle: active.title,
        sourceId: source.id
      }
    });
    setStatus?.('Research source preserved in Reality Ledger');
  }

  function deleteActiveSession() {
    if (!active) return;
    setSessions((items) => items.filter((session) => session.id !== active.id));
    setStatus?.(`Research session removed: ${active.title}`);
  }

  return (
    <section className="page-section research-page">
      <div className="section-heading research-heading">
        <div>
          <p className="eyebrow">RESEARCH MODE · LOCAL</p>
          <h1>Turn scattered browsing into a traceable investigation.</h1>
        </div>
        <div className="research-totals" aria-label="Research totals">
          <span><strong>{sessions.length}</strong> sessions</span>
          <span><strong>{totals.sources}</strong> sources</span>
          <span><strong>{totals.notes}</strong> notes</span>
          <span><strong>{totals.questions}</strong> open questions</span>
        </div>
      </div>

      <div className="research-layout">
        <aside className="research-sidebar">
          <form className="research-new" onSubmit={createSession}>
            <label>New research session</label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Quantum fabric, switch migration..." required />
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Guiding question (optional)" rows="3" />
            <button className="primary-button">Create session</button>
          </form>

          <div className="research-session-list">
            {sessions.length === 0 && <p className="empty-state">No sessions yet. Civilization survives somehow.</p>}
            {sessions.map((session) => (
              <button
                key={session.id}
                className={`research-session-button ${session.id === activeId ? 'active' : ''}`}
                onClick={() => setActiveId(session.id)}
              >
                <strong>{session.title}</strong>
                <span>{session.sources.length} sources · {session.notes.length} notes</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="research-main">
          {!active ? (
            <div className="research-empty">
              <span>◎</span>
              <h2>Create a research session.</h2>
              <p>Sources, notes, unresolved questions, and Ledger captures will stay grouped locally under one investigation.</p>
            </div>
          ) : (
            <>
              <header className="research-session-header">
                <div>
                  <p className="eyebrow">ACTIVE SESSION</p>
                  <h2>{active.title}</h2>
                  {active.question && <p>{active.question}</p>}
                </div>
                <div className="research-actions">
                  <button className="ghost-button" onClick={() => downloadJson(`browsallax-research-${active.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, active)}>Export</button>
                  <button className="danger-button" onClick={deleteActiveSession}>Delete</button>
                </div>
              </header>

              <div className="research-columns">
                <section className="research-panel">
                  <div className="research-panel-title">
                    <div><p className="eyebrow">SOURCES</p><h3>{active.sources.length} captured</h3></div>
                  </div>
                  <form className="research-stack-form" onSubmit={addSource}>
                    <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="Source title" />
                    <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://source.example" required />
                    <textarea value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="Why it matters / exact claim (optional)" rows="3" />
                    <button>Add source</button>
                  </form>
                  <div className="research-items">
                    {active.sources.length === 0 && <p className="empty-state">No sources recorded yet.</p>}
                    {active.sources.map((source) => (
                      <article className="research-item source-item" key={source.id}>
                        <div>
                          <strong>{source.title}</strong>
                          <small>{safeHostname(source.url)}</small>
                          {source.note && <p>{source.note}</p>}
                        </div>
                        <div className="research-item-actions">
                          <button onClick={() => openExternal(source.url)}>Open ↗</button>
                          <button onClick={() => ledgerSource(source)}>Ledger</button>
                          <button className="delete-button" onClick={() => removeSource(source.id)} aria-label={`Remove ${source.title}`}>×</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="research-panel">
                  <div className="research-panel-title"><div><p className="eyebrow">NOTES</p><h3>{active.notes.length} observations</h3></div></div>
                  <form className="research-stack-form" onSubmit={addNote}>
                    <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Write an observation, result, comparison, or idea..." rows="5" required />
                    <button>Add note</button>
                  </form>
                  <div className="research-items">
                    {active.notes.length === 0 && <p className="empty-state">No notes yet.</p>}
                    {active.notes.map((note) => (
                      <article className="research-item note-item" key={note.id}>
                        <p>{note.text}</p>
                        <div className="research-item-actions">
                          <button onClick={() => ledgerNote(note)}>Preserve in Ledger</button>
                          <button className="delete-button" onClick={() => removeNote(note.id)} aria-label="Remove research note">×</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>

              <section className="research-panel questions-panel">
                <div className="research-panel-title"><div><p className="eyebrow">UNRESOLVED</p><h3>Questions worth keeping visible.</h3></div></div>
                <form className="question-form" onSubmit={addQuestion}>
                  <input value={questionText} onChange={(event) => setQuestionText(event.target.value)} placeholder="What still needs to be answered?" required />
                  <button>Add question</button>
                </form>
                <div className="question-list">
                  {active.questions.length === 0 && <p className="empty-state">No unresolved questions. Suspiciously efficient.</p>}
                  {active.questions.map((item) => (
                    <label className={`question-item ${item.resolved ? 'resolved' : ''}`} key={item.id}>
                      <input type="checkbox" checked={item.resolved} onChange={() => toggleQuestion(item.id)} />
                      <span>{item.text}</span>
                    </label>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
