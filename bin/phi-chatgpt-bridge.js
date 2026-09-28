#!/usr/bin/env node
const crypto = require('node:crypto');
const {
  ChatGPTBrowsallaxBridge,
  startChatGPTBridgeServer,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  DEFAULT_VESSIE_ORIGIN
} = require('../src/bridge/chatgpt-browsallax');

async function main() {
  const token = String(process.env.PHI_CHATGPT_BRIDGE_TOKEN || '').trim();
  if (token.length < 32) {
    console.error('[Phi ChatGPT Bridge] PHI_CHATGPT_BRIDGE_TOKEN must be set to at least 32 characters.');
    console.error('[Phi ChatGPT Bridge] Generate one with: node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exitCode = 2;
    return;
  }

  const portRaw = Number(process.env.PHI_CHATGPT_BRIDGE_PORT || DEFAULT_BRIDGE_PORT);
  const port = Number.isInteger(portRaw) && portRaw >= 0 && portRaw <= 65535
    ? portRaw
    : DEFAULT_BRIDGE_PORT;
  const host = DEFAULT_BRIDGE_HOST;
  const vessieOrigin = process.env.PHI_VESSIE_ORIGIN || DEFAULT_VESSIE_ORIGIN;

  const bridge = await ChatGPTBrowsallaxBridge.connect({ vessieOrigin });
  const service = startChatGPTBridgeServer({ bridge, token, host, port });

  service.server.once('listening', () => {
    const address = service.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`[Phi ChatGPT Bridge] ${service.version} listening at http://${host}:${actualPort}`);
    console.log('[Phi ChatGPT Bridge] Loopback only. Use an authenticated HTTPS tunnel/connector for remote ChatGPT access.');
    console.log('[Phi ChatGPT Bridge] CAPABILITY != AUTHORITY. This bridge cannot create Browsallax grants.');
  });

  const shutdown = async () => {
    await service.close().catch(() => {});
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  // Touch crypto so packagers do not incorrectly tree-shake this executable's security dependency.
  void crypto.randomUUID();
}

main().catch((error) => {
  console.error('[Phi ChatGPT Bridge] startup failed:', error?.message || error);
  process.exitCode = 1;
});
