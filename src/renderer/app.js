const tabsEl = document.getElementById('tabs');
const omnibox = document.getElementById('omnibox');
const omniboxForm = document.getElementById('omnibox-form');
const backButton = document.getElementById('back');
const forwardButton = document.getElementById('forward');
const reloadButton = document.getElementById('reload');
const homeButton = document.getElementById('home');
const newTabButton = document.getElementById('new-tab');

let lastState = null;
let editingOmnibox = false;

function renderTabs(state) {
  tabsEl.replaceChildren();

  for (const tab of state.tabs) {
    const tabButton = document.createElement('div');
    tabButton.className = `tab${tab.active ? ' active' : ''}`;
    tabButton.setAttribute('role', 'tab');
    tabButton.setAttribute('aria-selected', String(tab.active));
    tabButton.title = tab.title || tab.url || 'New Tab';

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || 'New Tab';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tab-close';
    close.textContent = '×';
    close.title = 'Close tab';
    close.setAttribute('aria-label', `Close ${tab.title || 'tab'}`);
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      window.browsallax.closeTab(tab.id);
    });

    tabButton.append(title, close);
    tabButton.addEventListener('click', () => window.browsallax.activateTab(tab.id));
    tabsEl.appendChild(tabButton);
  }
}

function renderState(state) {
  lastState = state;
  renderTabs(state);

  const active = state.active;
  backButton.disabled = !active?.canGoBack;
  forwardButton.disabled = !active?.canGoForward;
  reloadButton.textContent = active?.loading ? '×' : '↻';
  reloadButton.title = active?.loading ? 'Stop loading is planned for v0.2; reload for now' : 'Reload';

  if (!editingOmnibox) {
    omnibox.value = active?.url || '';
  }

  document.title = active?.title ? `${active.title} — Browsallax` : 'Browsallax';
}

omniboxForm.addEventListener('submit', (event) => {
  event.preventDefault();
  window.browsallax.navigate(omnibox.value);
  omnibox.blur();
});

omnibox.addEventListener('focus', () => {
  editingOmnibox = true;
  requestAnimationFrame(() => omnibox.select());
});

omnibox.addEventListener('blur', () => {
  editingOmnibox = false;
  if (lastState?.active) omnibox.value = lastState.active.url || '';
});

backButton.addEventListener('click', () => window.browsallax.back());
forwardButton.addEventListener('click', () => window.browsallax.forward());
reloadButton.addEventListener('click', () => window.browsallax.reload());
homeButton.addEventListener('click', () => window.browsallax.home());
newTabButton.addEventListener('click', () => window.browsallax.newTab());

window.addEventListener('keydown', (event) => {
  const modifier = event.ctrlKey || event.metaKey;

  if (modifier && event.key.toLowerCase() === 'l') {
    event.preventDefault();
    omnibox.focus();
    return;
  }

  if (modifier && event.key.toLowerCase() === 't') {
    event.preventDefault();
    window.browsallax.newTab();
    return;
  }

  if (modifier && event.key.toLowerCase() === 'w' && lastState?.activeTabId) {
    event.preventDefault();
    window.browsallax.closeTab(lastState.activeTabId);
    return;
  }

  if (event.altKey && event.key === 'ArrowLeft') {
    event.preventDefault();
    window.browsallax.back();
  }

  if (event.altKey && event.key === 'ArrowRight') {
    event.preventDefault();
    window.browsallax.forward();
  }
});

window.browsallax.onState(renderState);
