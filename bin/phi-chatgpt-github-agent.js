#!/usr/bin/env node
const {
  ChatGPTGitHubMailboxAgent,
  CHATGPT_GITHUB_AGENT_VERSION,
  DEFAULT_REPOSITORY,
  defaultMailboxDir
} = require('../src/bridge/chatgpt-github-agent');

async function main() {
  const repository = String(process.env.PHI_GITHUB_BRIDGE_REPO || DEFAULT_REPOSITORY).trim();
  const directory = String(process.env.PHI_GITHUB_BRIDGE_DIR || defaultMailboxDir()).trim();
  const branch = String(process.env.PHI_GITHUB_BRIDGE_BRANCH || 'main').trim();

  const agent = await ChatGPTGitHubMailboxAgent.connect({
    repository,
    directory,
    branch
  });

  const controller = new AbortController();
  const shutdown = () => controller.abort(new Error('GITHUB_BRIDGE_AGENT_SHUTDOWN'));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  console.log(`[Phi GitHub Bridge] ${CHATGPT_GITHUB_AGENT_VERSION} connected to ${repository}@${branch}`);
  console.log(`[Phi GitHub Bridge] Mailbox: ${directory}`);
  console.log('[Phi GitHub Bridge] Allowed operations: bridge.status, vessie.observe, vessie.ask, vessie.resume');
  console.log('[Phi GitHub Bridge] CAPABILITY != AUTHORITY. GitHub is transport only.');

  try {
    await agent.runForever({
      signal: controller.signal,
      onEvent: (event) => {
        if (event.type === 'error') {
          console.error('[Phi GitHub Bridge] poll error:', event.error);
        } else if (event.handled) {
          console.log(
            `[Phi GitHub Bridge] ${event.operation || 'invalid'} ${event.ok ? 'complete' : 'failed'} request=${event.id}`
          );
        }
      }
    });
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  }
}

main().catch((error) => {
  console.error('[Phi GitHub Bridge] startup failed:', error?.message || error);
  process.exitCode = 1;
});
