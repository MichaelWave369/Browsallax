#!/usr/bin/env node
const {
  ChatGPTRelayAgent,
  CHATGPT_RELAY_AGENT_VERSION
} = require('../src/bridge/chatgpt-relay-agent');

async function main() {
  const relayUrl = String(process.env.PHI_CHATGPT_RELAY_URL || '').trim();
  const agentToken = String(process.env.PHI_CHATGPT_RELAY_AGENT_TOKEN || '').trim();

  if (!relayUrl) {
    console.error('[Phi Relay Agent] PHI_CHATGPT_RELAY_URL is required.');
    process.exitCode = 2;
    return;
  }

  if (agentToken.length < 32) {
    console.error('[Phi Relay Agent] PHI_CHATGPT_RELAY_AGENT_TOKEN must be at least 32 characters.');
    process.exitCode = 2;
    return;
  }

  const agent = await ChatGPTRelayAgent.connect({
    relayUrl,
    agentToken
  });

  const controller = new AbortController();
  const shutdown = () => controller.abort(new Error('RELAY_AGENT_SHUTDOWN'));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  console.log(`[Phi Relay Agent] ${CHATGPT_RELAY_AGENT_VERSION} connected outbound to ${agent.relayUrl}`);
  console.log('[Phi Relay Agent] Allowed operations: bridge.status, vessie.observe, vessie.ask, vessie.resume');
  console.log('[Phi Relay Agent] CAPABILITY != AUTHORITY. This agent cannot create Browsallax grants.');

  try {
    await agent.runForever({
      signal: controller.signal,
      onEvent: (event) => {
        if (event.type === 'error') {
          console.error('[Phi Relay Agent] poll error:', event.error);
        } else if (event.handled) {
          console.log(`[Phi Relay Agent] ${event.operation} ${event.ok ? 'complete' : 'failed'} request=${event.id}`);
        }
      }
    });
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  }
}

main().catch((error) => {
  console.error('[Phi Relay Agent] startup failed:', error?.message || error);
  process.exitCode = 1;
});
