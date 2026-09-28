const OBSERVE_SCRIPT = `(() => {
  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const visible = (el) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const cssEscape = (value) => (window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'));
  const selectorFor = (el) => {
    if (el.id) return '#' + cssEscape(el.id);
    const testId = el.getAttribute('data-testid');
    if (testId) return '[data-testid="' + String(testId).replace(/"/g, '\\\\"') + '"]';
    const dataTool = el.getAttribute('data-tool');
    if (dataTool) return '[data-tool="' + String(dataTool).replace(/"/g, '\\"') + '"]';
    const name = el.getAttribute('name');
    if (name && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName)) {
      return el.tagName.toLowerCase() + '[name="' + String(name).replace(/"/g, '\\\\"') + '"]';
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((child) => child.tagName === node.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      const candidate = parts.join(' > ');
      try {
        if (document.querySelectorAll(candidate).length === 1) return candidate;
      } catch {}
      node = parent;
    }
    return parts.join(' > ');
  };

  const candidates = [...document.querySelectorAll('a,button,input,textarea,select,canvas,[role="button"],[role="link"],[contenteditable="true"]')]
    .filter(visible)
    .slice(0, 500);

  const elements = candidates.map((el, index) => {
    const rect = el.getBoundingClientRect();
    const inputType = String(el.getAttribute('type') || '').toLowerCase();
    const autocomplete = String(el.getAttribute('autocomplete') || '').toLowerCase();
    const secretValue = inputType === 'password' || inputType === 'file' || autocomplete.includes('password') || autocomplete === 'one-time-code';
    const optionText = el.tagName === 'SELECT'
      ? [...el.options].slice(0, 50).map((o) => normalize(o.textContent))
      : undefined;
    return {
      ref: 'e' + (index + 1),
      selector: selectorFor(el),
      tagName: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      type: el.getAttribute('type') || '',
      name: el.getAttribute('name') || '',
      text: secretValue ? '[REDACTED]' : normalize(el.innerText || el.value || el.textContent).slice(0, 500),
      ariaLabel: el.getAttribute('aria-label') || '',
      title: el.getAttribute('title') || '',
      placeholder: el.getAttribute('placeholder') || '',
      autocomplete: el.getAttribute('autocomplete') || '',
      dataTool: el.getAttribute('data-tool') || '',
      ariaPressed: el.getAttribute('aria-pressed') || '',
      href: el.href || '',
      disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      checked: typeof el.checked === 'boolean' ? el.checked : undefined,
      value: ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ? (secretValue ? '[REDACTED]' : String(el.value || '').slice(0, 1000)) : undefined,
      options: optionText,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    };
  });

  return {
    url: location.href,
    title: document.title,
    text: normalize(document.body ? document.body.innerText : '').slice(0, 30000),
    viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY },
    elements
  };
})()`;

const TARGET_SCRIPT = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const label = el.labels && el.labels.length ? [...el.labels].map((item) => normalize(item.innerText || item.textContent)).join(' ') : '';
  return {
    selector: ${JSON.stringify(selector)},
    tagName: el.tagName.toLowerCase(),
    role: el.getAttribute('role') || '',
    type: el.getAttribute('type') || '',
    name: el.getAttribute('name') || '',
    autocomplete: el.getAttribute('autocomplete') || '',
    placeholder: el.getAttribute('placeholder') || '',
    text: normalize(el.innerText || label || el.getAttribute('placeholder') || el.textContent).slice(0, 500),
    ariaLabel: el.getAttribute('aria-label') || '',
    title: el.getAttribute('title') || '',
    href: el.href || '',
    disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
    rect: (() => {
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    })()
  };
})()`;

module.exports = { OBSERVE_SCRIPT, TARGET_SCRIPT };
