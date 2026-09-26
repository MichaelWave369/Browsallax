const crypto = require('node:crypto');

const TASK_ENGINE_VERSION = 'PV-BOP-TASK-0.1';
const TERMINAL = new Set(['COMPLETE', 'FAILED', 'CANCELLED']);

function sanitizeAction(action = {}) {
  const copy = { ...action };
  if (Object.prototype.hasOwnProperty.call(copy, 'value')) copy.value = '[REDACTED]';
  return copy;
}

function normalizeAcceptance(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw Object.assign(new Error('TASK_ACCEPTANCE_INVALID'), { statusCode: 400 });
    }
    const kind = String(item.kind || '').toLowerCase();
    if (!['url_contains', 'text_contains', 'visible'].includes(kind)) {
      throw Object.assign(new Error('TASK_ACCEPTANCE_KIND_INVALID'), { statusCode: 400 });
    }
    if (kind === 'visible') {
      const selector = String(item.selector || '').trim();
      if (!selector) throw Object.assign(new Error('TASK_ACCEPTANCE_SELECTOR_REQUIRED'), { statusCode: 400 });
      return { kind, selector: selector.slice(0, 2000) };
    }
    return { kind, value: String(item.value || '').slice(0, 4000) };
  });
}

function publicTask(task) {
  return {
    id: task.id,
    tabId: task.tabId,
    goal: task.goal,
    constraints: task.constraints,
    successCriteria: task.successCriteria,
    acceptance: task.acceptance,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    stepCount: task.stepCount,
    maxSteps: task.maxSteps,
    maxDurationMs: task.maxDurationMs,
    held: task.held,
    result: task.result,
    error: task.error,
    planner: task.planner,
    history: task.history.slice(-20).map((entry) => ({
      step: entry.step,
      phase: entry.phase,
      thoughtSummary: entry.thoughtSummary,
      action: sanitizeAction(entry.action),
      outcome: entry.outcome,
      timestamp: entry.timestamp
    }))
  };
}

class BrowserTaskEngine {
  constructor({ planner, ledger, observe, navigate, executeAction, assert, getGrant }) {
    this.planner = planner;
    this.ledger = ledger;
    this.observe = observe;
    this.navigate = navigate;
    this.executeAction = executeAction;
    this.assert = assert;
    this.getGrant = getGrant;
    this.tasks = new Map();
    this.controllers = new Map();
  }

  list() {
    return [...this.tasks.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(publicTask);
  }

  get(id) {
    const task = this.tasks.get(String(id));
    return task ? publicTask(task) : null;
  }

  activeForTab(tabId) {
    return [...this.tasks.values()].find((task) => (
      Number(task.tabId) === Number(tabId) &&
      !TERMINAL.has(task.status)
    )) || null;
  }

  async create(input = {}) {
    const tabId = Number(input.tabId);
    const goal = String(input.goal || '').trim();
    if (!Number.isFinite(tabId)) throw Object.assign(new Error('TASK_TAB_REQUIRED'), { statusCode: 400 });
    if (!goal) throw Object.assign(new Error('TASK_GOAL_REQUIRED'), { statusCode: 400 });
    if (goal.length > 4000) throw Object.assign(new Error('TASK_GOAL_TOO_LONG'), { statusCode: 400 });
    if (this.activeForTab(tabId)) throw Object.assign(new Error('TASK_ALREADY_RUNNING_ON_TAB'), { statusCode: 409 });

    const constraints = Array.isArray(input.constraints)
      ? input.constraints.map((item) => String(item).trim()).filter(Boolean).slice(0, 30)
      : [];
    const successCriteria = Array.isArray(input.successCriteria)
      ? input.successCriteria.map((item) => String(item).trim()).filter(Boolean).slice(0, 30)
      : [];
    const acceptance = normalizeAcceptance(input.acceptance);
    const maxSteps = Math.max(1, Math.min(40, Number(input.maxSteps || 20)));
    const maxDurationMs = Math.max(10000, Math.min(10 * 60 * 1000, Number(input.maxDurationMs || 3 * 60 * 1000)));
    const now = new Date().toISOString();

    const task = {
      id: crypto.randomUUID(),
      tabId,
      goal,
      constraints,
      successCriteria,
      acceptance,
      status: 'QUEUED',
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
      stepCount: 0,
      maxSteps,
      maxDurationMs,
      held: null,
      result: null,
      error: null,
      planner: null,
      history: []
    };

    this.tasks.set(task.id, task);
    await this.ledger.append('TASK_CREATED', {
      taskId: task.id,
      tabId,
      goal,
      constraints,
      successCriteria,
      acceptance,
      maxSteps,
      maxDurationMs,
      taskEngineVersion: TASK_ENGINE_VERSION
    });

    this.run(task.id).catch(() => {});
    return publicTask(task);
  }

  async run(id) {
    const task = this.tasks.get(String(id));
    if (!task || TERMINAL.has(task.status)) return;
    if (task.status === 'RUNNING') return;
    if (task.status === 'HELD') task.held = null;

    const controller = new AbortController();
    this.controllers.set(task.id, controller);
    const startedMs = Date.now();
    if (!task.startedAt) task.startedAt = new Date().toISOString();
    task.status = 'RUNNING';
    task.updatedAt = new Date().toISOString();
    await this.ledger.append('TASK_STARTED', {
      taskId: task.id,
      tabId: task.tabId,
      stepCount: task.stepCount,
      resumed: task.stepCount > 0
    });

    try {
      while (!controller.signal.aborted) {
        if (task.stepCount >= task.maxSteps) {
          return await this.fail(task, 'MAX_STEPS_REACHED');
        }
        if (Date.now() - startedMs > task.maxDurationMs) {
          return await this.fail(task, 'MAX_DURATION_REACHED');
        }

        const snapshot = await this.observe(task.tabId);
        const plan = await this.planner.plan({
          task,
          snapshot,
          history: task.history,
          signal: controller.signal
        });

        task.planner = plan.planner;
        task.stepCount += 1;
        const step = task.stepCount;
        const entry = {
          step,
          phase: 'PLAN',
          thoughtSummary: plan.thoughtSummary,
          action: plan.action,
          outcome: null,
          timestamp: new Date().toISOString()
        };
        task.history.push(entry);
        task.updatedAt = new Date().toISOString();

        await this.ledger.append('TASK_PLAN', {
          taskId: task.id,
          step,
          thoughtSummary: plan.thoughtSummary,
          action: sanitizeAction(plan.action),
          successEvidence: plan.successEvidence,
          planner: plan.planner
        });

        const action = plan.action;
        if (action.type === 'finish') {
          if (action.status === 'complete') {
            const verification = await this.verifyAcceptance(task, { step });
            if (verification.pass) {
              return await this.complete(
                task,
                action.summary || plan.successEvidence || 'Task complete.',
                verification
              );
            }

            entry.phase = 'VERIFY';
            entry.outcome = {
              ok: false,
              status: 'ACCEPTANCE_FAILED',
              verification
            };
            task.updatedAt = new Date().toISOString();
            await this.ledger.append('TASK_ACCEPTANCE_FAILED', {
              taskId: task.id,
              step,
              verification
            });
            continue;
          }
          return await this.fail(task, action.summary || 'Planner declared task failed.');
        }

        let outcome;
        if (action.type === 'navigate') {
          outcome = await this.navigate(task.tabId, action.url, { taskId: task.id, step });
        } else if (action.type === 'assert') {
          outcome = await this.assert(task.tabId, action.assertion, { taskId: task.id, step });
        } else {
          outcome = await this.executeAction(task.tabId, action, { taskId: task.id, step });
        }

        entry.phase = 'ACT';
        entry.outcome = {
          ok: Boolean(outcome?.ok),
          status: outcome?.status || null,
          actionClass: outcome?.actionClass || null,
          authority: outcome?.authority?.basis || outcome?.authority || null,
          error: outcome?.error || null,
          assertion: outcome?.pass
        };
        task.updatedAt = new Date().toISOString();

        await this.ledger.append('TASK_STEP', {
          taskId: task.id,
          step,
          action: sanitizeAction(action),
          outcome: entry.outcome
        });

        if (outcome?.status === 'HELD') {
          task.status = 'HELD';
          task.held = {
            step,
            action: sanitizeAction(action),
            actionClass: outcome.actionClass || null,
            authority: outcome.authority || null,
            reason: outcome.authority?.reason || outcome.error || 'AUTHORITY_REQUIRED'
          };
          task.updatedAt = new Date().toISOString();
          await this.ledger.append('TASK_HELD', {
            taskId: task.id,
            step,
            held: task.held
          });
          return publicTask(task);
        }

        if (outcome?.ok === false && action.type !== 'assert') {
          entry.phase = 'REPLAN';
        }
      }

      if (controller.signal.aborted && task.status !== 'CANCELLED') {
        return await this.cancel(task.id, 'TASK_CANCELLED');
      }
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        if (task.status !== 'CANCELLED') return await this.cancel(task.id, 'TASK_CANCELLED');
        return publicTask(task);
      }
      return await this.fail(task, error?.code || error?.message || 'TASK_ENGINE_ERROR');
    } finally {
      this.controllers.delete(task.id);
    }
  }

  async resume(id) {
    const task = this.tasks.get(String(id));
    if (!task) throw Object.assign(new Error('TASK_NOT_FOUND'), { statusCode: 404 });
    if (task.status !== 'HELD') throw Object.assign(new Error('TASK_NOT_HELD'), { statusCode: 409 });

    const grant = this.getGrant();
    if (!grant || grant.enabled !== true || Number(grant.expiresAt || 0) <= Date.now()) {
      throw Object.assign(new Error('HUMAN_INTERACTIVE_GRANT_REQUIRED'), { statusCode: 409 });
    }

    task.status = 'QUEUED';
    task.held = null;
    task.updatedAt = new Date().toISOString();
    await this.ledger.append('TASK_RESUMED', {
      taskId: task.id,
      grantId: grant.id,
      expiresAt: grant.expiresAt
    });
    this.run(task.id).catch(() => {});
    return publicTask(task);
  }

  async cancel(id, reason = 'USER_CANCELLED') {
    const task = this.tasks.get(String(id));
    if (!task) throw Object.assign(new Error('TASK_NOT_FOUND'), { statusCode: 404 });
    if (TERMINAL.has(task.status)) return publicTask(task);

    this.controllers.get(task.id)?.abort(new Error(reason));
    task.status = 'CANCELLED';
    task.result = { summary: reason };
    task.finishedAt = new Date().toISOString();
    task.updatedAt = task.finishedAt;
    await this.ledger.append('TASK_CANCELLED', {
      taskId: task.id,
      reason,
      stepCount: task.stepCount
    });
    return publicTask(task);
  }

  async verifyAcceptance(task, meta = {}) {
    if (!task.acceptance.length) {
      return {
        pass: true,
        mode: 'PLANNER_DECLARED',
        checks: []
      };
    }

    const checks = [];
    for (const assertion of task.acceptance) {
      const result = await this.assert(task.tabId, assertion, {
        taskId: task.id,
        acceptance: true,
        ...meta
      });
      checks.push({
        assertion,
        pass: Boolean(result?.pass),
        actual: result?.actual ?? null,
        error: result?.error || null
      });
    }

    return {
      pass: checks.every((check) => check.pass),
      mode: 'DETERMINISTIC_ASSERTIONS',
      checks
    };
  }

  async shutdown() {
    for (const controller of this.controllers.values()) {
      controller.abort(new Error('OPERATOR_SHUTDOWN'));
    }
    const pending = [...this.tasks.values()].filter((task) => !TERMINAL.has(task.status));
    for (const task of pending) {
      if (task.status !== 'CANCELLED') {
        task.status = 'CANCELLED';
        task.result = { summary: 'OPERATOR_SHUTDOWN' };
        task.finishedAt = new Date().toISOString();
        task.updatedAt = task.finishedAt;
        await this.ledger.append('TASK_CANCELLED', {
          taskId: task.id,
          reason: 'OPERATOR_SHUTDOWN',
          stepCount: task.stepCount
        });
      }
    }
    this.controllers.clear();
  }

  async complete(task, summary, verification = { pass: true, mode: 'PLANNER_DECLARED', checks: [] }) {
    task.status = 'COMPLETE';
    task.result = {
      summary: String(summary || 'Task complete.').slice(0, 4000),
      verification
    };
    task.finishedAt = new Date().toISOString();
    task.updatedAt = task.finishedAt;
    await this.ledger.append('TASK_COMPLETE', {
      taskId: task.id,
      stepCount: task.stepCount,
      result: task.result,
      planner: task.planner
    });
    return publicTask(task);
  }

  async fail(task, reason) {
    task.status = 'FAILED';
    task.error = String(reason || 'TASK_FAILED').slice(0, 4000);
    task.finishedAt = new Date().toISOString();
    task.updatedAt = task.finishedAt;
    await this.ledger.append('TASK_FAILED', {
      taskId: task.id,
      stepCount: task.stepCount,
      error: task.error,
      planner: task.planner
    });
    return publicTask(task);
  }
}

module.exports = {
  BrowserTaskEngine,
  TASK_ENGINE_VERSION,
  normalizeAcceptance,
  publicTask,
  sanitizeAction
};
