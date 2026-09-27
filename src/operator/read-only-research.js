const READ_ONLY_RESEARCH_COMPLETION_VERSION = 'PV-BOP-RRC-0.4';
const PREFER_FINISH_AT_STEP = 3;
const REQUIRE_TERMINATION_AT_STEP = 6;
const MAX_REQUIRE_TERMINATION_AT_STEP = 9;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function readOnlyResearchError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isReadOnlyResearchTask(task = {}) {
  const constraints = Array.isArray(task.constraints) ? task.constraints : [];
  return constraints.some((constraint) => {
    const text = normalizeText(constraint);
    return /\bread[- ]only\b/i.test(text) && /\b(information|research|gather|observation|observe|page|web)\b/i.test(text);
  });
}

function requireTerminationAtStep(task = {}) {
  const maxSteps = Math.floor(Number(task.maxSteps || 0));
  if (!Number.isFinite(maxSteps) || maxSteps <= 0) return REQUIRE_TERMINATION_AT_STEP;
  return Math.max(
    PREFER_FINISH_AT_STEP + 1,
    Math.min(MAX_REQUIRE_TERMINATION_AT_STEP, Math.max(1, maxSteps - 1))
  );
}

function completionMode(task = {}) {
  if (!isReadOnlyResearchTask(task)) return 'INACTIVE';
  const stepCount = Math.max(0, Number(task.stepCount || 0));
  const terminationStep = requireTerminationAtStep(task);
  if (stepCount >= terminationStep) return 'TERMINATE_NOW';
  if (stepCount >= PREFER_FINISH_AT_STEP) return 'PREFER_FINISH';
  return 'NORMAL';
}

function isSearchResultsPage(snapshot = {}) {
  try {
    const url = new URL(String(snapshot.url || ''));
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if ((host === 'duckduckgo.com' || host === 'www.duckduckgo.com') && url.searchParams.has('q')) return true;
    if ((host === 'www.google.com' || host === 'google.com') && path === '/search' && url.searchParams.has('q')) return true;
    if ((host === 'www.bing.com' || host === 'bing.com') && path === '/search' && url.searchParams.has('q')) return true;
    if (host === 'search.brave.com' && path === '/search' && url.searchParams.has('q')) return true;
    if (host === 'search.yahoo.com' && path.startsWith('/search') && url.searchParams.has('p')) return true;
    return false;
  } catch {
    return false;
  }
}

function observedNavigationLinkCount(snapshot = {}) {
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  return elements.filter((element) => isObservedNavigationLink(element)).length;
}

function snapshotEvidence(snapshot = {}) {
  const text = String(snapshot.text || '');
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  return {
    url: String(snapshot.url || '').slice(0, 2000),
    title: String(snapshot.title || '').slice(0, 500),
    textChars: text.length,
    elementCount: elements.length,
    searchResultsPage: isSearchResultsPage(snapshot),
    navigationLinkCount: observedNavigationLinkCount(snapshot)
  };
}

function readOnlyResearchContext(task = {}, snapshot = {}) {
  const active = isReadOnlyResearchTask(task);
  const mode = completionMode(task);
  const stepCount = Math.max(0, Number(task.stepCount || 0));
  const terminationStep = requireTerminationAtStep(task);
  return {
    version: READ_ONLY_RESEARCH_COMPLETION_VERSION,
    active,
    mode,
    stepCount,
    preferFinishAtStep: PREFER_FINISH_AT_STEP,
    requireTerminationAtStep: terminationStep,
    remainingBeforeRequiredTermination: active
      ? Math.max(0, terminationStep - stepCount)
      : null,
    evidence: snapshotEvidence(snapshot)
  };
}

function readOnlyResearchPrompt(context = {}) {
  if (!context.active) return null;
  const lines = [
    'READ_ONLY_RESEARCH_COMPLETION='+READ_ONLY_RESEARCH_COMPLETION_VERSION,
    'This task is explicitly declared READ-ONLY information gathering.',
    'Do not type into fields or select form values.',
    'A click is allowed only when the observed target is an ordinary link with an href and navigation is necessary.',
    'Prefer direct observation, navigation, scrolling, assertions, and FINISH.',
    'If the current observation already supports the user-requested information, FINISH immediately with status complete.',
    'Do not continue browsing merely to improve wording, gather redundant confirmation, or consume the remaining step budget.',
    'If required evidence is not present, take only one action that is necessary to obtain the specific missing evidence.',
    'A search-results page is an intermediate research surface, not by itself evidence that the task failed.',
    'When the current page is a recognized search-results page and relevant ordinary result links are observed, follow the single most relevant observed result link before declaring failure, while the bounded research budget permits.',
    'COMPLETION_MODE='+String(context.mode || 'NORMAL'),
    'STEP_COUNT='+Number(context.stepCount || 0),
    'REQUIRED_TERMINATION_STEP='+Number(context.requireTerminationAtStep || REQUIRE_TERMINATION_AT_STEP),
    'OBSERVED_URL='+String(context.evidence?.url || ''),
    'OBSERVED_TITLE='+String(context.evidence?.title || ''),
    'OBSERVED_TEXT_CHARS='+Number(context.evidence?.textChars || 0),
    'OBSERVED_ELEMENT_COUNT='+Number(context.evidence?.elementCount || 0),
    'SEARCH_RESULTS_PAGE='+(context.evidence?.searchResultsPage ? 'YES' : 'NO'),
    'OBSERVED_NAVIGATION_LINK_COUNT='+Number(context.evidence?.navigationLinkCount || 0)
  ];

  if (
    context.mode === 'NORMAL' &&
    context.evidence?.searchResultsPage === true &&
    Number(context.evidence?.navigationLinkCount || 0) > 0
  ) {
    lines.push(
      'SEARCH_RESULT_CONTINUATION_REQUIRED=YES',
      'On this planning turn, finish status failed is locally invalid while observed navigation links are available.',
      'Choose exactly one relevant observed navigation link using its exact ref or selector.'
    );
  }

  if (context.mode === 'PREFER_FINISH') {
    lines.push(
      'PREFER_FINISH=YES',
      'Before any further navigation or scrolling, decide whether the current observed page already answers the task. If yes, FINISH now.'
    );
  }

  if (context.mode === 'TERMINATE_NOW') {
    lines.push(
      'TERMINATE_NOW=YES',
      'You MUST choose a finish action on this planning turn.',
      'Use finish status complete if observed page evidence is sufficient.',
      'Otherwise use finish status failed and state the missing evidence honestly.'
    );
  }

  return lines.join('\n');
}

function observedElement(snapshot = {}, selector) {
  const target = normalizeText(selector);
  if (!target) return null;
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  return elements.find((element) => normalizeText(element?.selector) === target) || null;
}

function isObservedNavigationLink(element = {}) {
  const tag = normalizeText(element.tagName).toLowerCase();
  const role = normalizeText(element.role).toLowerCase();
  const href = normalizeText(element.href);
  return Boolean(href && (tag === 'a' || role === 'link'));
}

function enforceReadOnlyResearchPlan(plan = {}, task = {}, snapshot = {}) {
  const context = readOnlyResearchContext(task, snapshot);
  if (!context.active) return { plan, context };

  const action = plan?.action || {};
  const type = normalizeText(action.type).toLowerCase();

  if (type === 'type' || type === 'select') {
    throw readOnlyResearchError('PLANNER_READ_ONLY_ACTION_FORBIDDEN');
  }

  if (type === 'click') {
    const element = observedElement(snapshot, action.selector);
    if (!element) {
      throw readOnlyResearchError('PLANNER_READ_ONLY_CLICK_TARGET_UNOBSERVED');
    }
    if (!isObservedNavigationLink(element)) {
      throw readOnlyResearchError('PLANNER_READ_ONLY_CLICK_NOT_LINK');
    }
  }

  const finishStatus = normalizeText(action.status).toLowerCase();
  if (
    context.mode === 'NORMAL' &&
    type === 'finish' &&
    finishStatus === 'failed' &&
    context.evidence?.searchResultsPage === true &&
    Number(context.evidence?.navigationLinkCount || 0) > 0
  ) {
    throw readOnlyResearchError('PLANNER_READ_ONLY_SEARCH_RESULTS_REQUIRE_NAVIGATION');
  }

  if (context.mode === 'TERMINATE_NOW' && type !== 'finish') {
    throw readOnlyResearchError('PLANNER_READ_ONLY_TERMINATION_REQUIRED');
  }

  return { plan, context };
}

module.exports = {
  READ_ONLY_RESEARCH_COMPLETION_VERSION,
  PREFER_FINISH_AT_STEP,
  REQUIRE_TERMINATION_AT_STEP,
  MAX_REQUIRE_TERMINATION_AT_STEP,
  requireTerminationAtStep,
  isReadOnlyResearchTask,
  completionMode,
  isSearchResultsPage,
  observedNavigationLinkCount,
  snapshotEvidence,
  readOnlyResearchContext,
  readOnlyResearchPrompt,
  observedElement,
  isObservedNavigationLink,
  enforceReadOnlyResearchPlan
};
