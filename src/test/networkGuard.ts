// Test-only network boundary. No production imports. Restoring Vitest mocks cannot
// restore real transports: these replacements are installed before test modules.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const attempts: string[] = [];
function blocked(transport: string): never {
  attempts.push(transport);
  throw new Error(`Real network disabled in unit tests (${transport}); mock the integration explicitly`);
}
export function takeBlockedNetworkAttempts(): string[] { return attempts.splice(0); }

export function installTestNetworkGuard() {
  // vi.stubGlobal can temporarily replace this with an explicit fake fetch; its
  // original value is this guard, never the real network implementation.
  globalThis.fetch = async () => blocked('fetch');
  for (const [module, name] of [[http, 'http'], [https, 'https']] as const) {
    Object.defineProperty(module, 'request', { configurable: true, writable: true, value: () => blocked(`${name}.request`) });
    Object.defineProperty(module, 'get', { configurable: true, writable: true, value: () => blocked(`${name}.get`) });
  }
  Object.defineProperty(net.Socket.prototype, 'connect', { configurable: true, writable: true, value: () => blocked('socket.connect') });
  Object.defineProperty(tls, 'connect', { configurable: true, writable: true, value: () => blocked('tls.connect') });
  if (typeof XMLHttpRequest !== 'undefined') {
    XMLHttpRequest.prototype.send = () => blocked('XMLHttpRequest.send');
  }
  if (typeof WebSocket !== 'undefined') {
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: class { constructor() { blocked('WebSocket'); } } });
  }
}
