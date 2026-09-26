const READ_ONLY_RESEARCH_COMPLETION_VERSION = 'PV-BOP-RRC-0.1';
const PREFER_FINISH_AT_STEP = 3;
const REQUIRE_TERMINATION_AT_STEP = 6;

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

function completionMode(task = {}) {
  if (!isReadOnlyResearchTask(task)) return 'INACTIVE';
  const stepCount = Math.max(0, Number(task.stepCount || 0));
  if (stepCount >= REQUIRE_TERMINATION_AT_STEP) return 'TERMINATE_NOW';
  if (stepCount >= PREFER_FINISH_AT_STEP) return 'PREFER_FINISH';
  return 'NORMAL';
}

function snapshotEvidence(snapshot = {}) {
  const text = String(snapshot.text || '');
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  return {
    url: String(snapshot.url || '').slice(0, 2000),
    title: String(snapshot.title || '').slice(0, 500),
    textChars: text.length,
    elementCount: elements.length
  };
}

function readOnlyResearchContext(task = {}, snapshot = {}) {
  const active = isReadOnlyResearchTask(task);
  const mode = completionMode(task);
  const stepCount = Math.max(0, Number(task.stepCount || 0));
  return {
    version: READ_ONLY_RESEARCH_COMPLETION_VERSION,
    active,
    mode,
    stepCount,
    preferFinishAtStep: PREFER_FINISH_AT_STEP,
    requireTerminationAtStep: REQUIRE_TERMINATION_AT_STEP,
    remainingBeforeRequiredTermination: active
      ? Math.max(0, REQUIRE_TERMINATION_AT_STEP - stepCount)
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
    'COMPLETION_MODE='+String(context.mode || 'NORMAL'),
    'STEP_COUNT='+Number(context.stepCount || 0),
    'REQUIRED_TERMINATION_STEP='+Number(context.requireTerminationAtStep || REQUIRE_TERMINATION_AT_STEP),
    'OBSERVED_URL='+String(context.evidence?.url || ''),
    'OBSERVED_TITLE='+String(context.evidence?.title || ''),
    'OBSERVED_TEXT_CHARS='+Number(context.evidence?.textChars || 0),
    'OBSERVED_ELEMENT_COUNT='+Number(context.evidence?.elementCount || 0)
  ];

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

  if (context.mode === 'TERMINATE_NOW' && type !== 'finish') {
    throw readOnlyResearchError('PLANNER_READ_ONLY_TERMINATION_REQUIRED');
  }

  return { plan, context };
}

module.exports = {
  READ_ONLY_RESEARCH_COMPLETION_VERSION,
  PREFER_FINISH_AT_STEP,
  REQUIRE_TERMINATION_AT_STEP,
  isReadOnlyResearchTask,
  completionMode,
  snapshotEvidence,
  readOnlyResearchContext,
  readOnlyResearchPrompt,
  observedElement,
  isObservedNavigationLink,
  enforceReadOnlyResearchPlan
};
