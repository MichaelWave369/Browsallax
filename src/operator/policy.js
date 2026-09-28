const SENSITIVE_PATTERN = /\b(delete|remove|erase|destroy|purchase|buy|checkout|pay|payment|card number|cvv|cvc|bank|routing number|account number|social security|ssn|api key|secret|token|passcode|verification code|otp|transfer|withdraw|send money|publish|deploy|merge|close account|cancel subscription|change password|reset password|enable 2fa|disable 2fa|revoke|terminate)\b/i;

const ACTION_CLASSES = Object.freeze({
  READ_ONLY: 'READ_ONLY',
  NAVIGATION: 'NAVIGATION',
  FORM_INPUT: 'FORM_INPUT',
  REMOTE_MUTATION: 'REMOTE_MUTATION',
  SENSITIVE_ACTION: 'SENSITIVE_ACTION'
});

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function classifyClick(target = {}) {
  const tag = normalizeText(target.tagName).toLowerCase();
  const role = normalizeText(target.role).toLowerCase();
  const type = normalizeText(target.type).toLowerCase();
  const text = normalizeText([target.text, target.ariaLabel, target.title, target.name].filter(Boolean).join(' '));
  const href = normalizeText(target.href);

  if (SENSITIVE_PATTERN.test(text)) return ACTION_CLASSES.SENSITIVE_ACTION;
  if (tag === 'a' && href) return ACTION_CLASSES.NAVIGATION;
  if (role === 'link' && href) return ACTION_CLASSES.NAVIGATION;

  if (tag === 'button' || role === 'button' || type === 'submit' || type === 'button') {
    return ACTION_CLASSES.REMOTE_MUTATION;
  }

  return ACTION_CLASSES.REMOTE_MUTATION;
}

function classifyAction(action = {}, target = {}) {
  switch (String(action.type || '').toLowerCase()) {
    case 'observe':
    case 'assert':
    case 'wait':
    case 'scroll':
      return ACTION_CLASSES.READ_ONLY;
    case 'navigate':
      return ACTION_CLASSES.NAVIGATION;
    case 'pointer_path':
      return ACTION_CLASSES.REMOTE_MUTATION;
    case 'type':
    case 'select': {
      const inputType = normalizeText(target.type).toLowerCase();
      const autocomplete = normalizeText(target.autocomplete).toLowerCase();
      const descriptor = normalizeText([
        target.text,
        target.ariaLabel,
        target.title,
        target.name,
        target.placeholder
      ].filter(Boolean).join(' '));
      const secretField = inputType === 'password' ||
        inputType === 'file' ||
        autocomplete.includes('password') ||
        autocomplete === 'one-time-code';
      return secretField || SENSITIVE_PATTERN.test(descriptor)
        ? ACTION_CLASSES.SENSITIVE_ACTION
        : ACTION_CLASSES.FORM_INPUT;
    }
    case 'click':
      return classifyClick(target);
    default:
      return ACTION_CLASSES.REMOTE_MUTATION;
  }
}

function evaluateAuthority(actionClass, grant) {
  if (actionClass === ACTION_CLASSES.READ_ONLY || actionClass === ACTION_CLASSES.NAVIGATION) {
    return { allowed: true, basis: 'BASELINE_LOCAL_OPERATOR' };
  }

  if (actionClass === ACTION_CLASSES.SENSITIVE_ACTION) {
    return {
      allowed: false,
      held: true,
      basis: 'SENSITIVE_ACTION_REQUIRES_EXPLICIT_PER_ACTION_APPROVAL',
      reason: 'Browsallax Operator v0.1 never auto-executes sensitive actions.'
    };
  }

  const now = Date.now();
  if (grant && grant.enabled === true && Number(grant.expiresAt || 0) > now) {
    return { allowed: true, basis: 'HUMAN_INTERACTIVE_GRANT', grantId: grant.id, expiresAt: grant.expiresAt };
  }

  return {
    allowed: false,
    held: true,
    basis: 'CAPABILITY_WITHOUT_AUTHORITY',
    reason: 'Interactive page mutation requires a current human grant from Browsallax chrome.'
  };
}

module.exports = { ACTION_CLASSES, classifyAction, evaluateAuthority, SENSITIVE_PATTERN };
