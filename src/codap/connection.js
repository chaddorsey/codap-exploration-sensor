/**
 * The plugin's one seam to CODAP.
 *
 * Subscribes to every Data Interactive notification ('*') and passes each one,
 * flattened to `{ resource, values }`, to the listener. Requests the plugin
 * makes itself (loading the sample, writing the log table) run inside
 * `asSelf()`, and notifications that arrive during and just after them are
 * dropped so the plugin never senses its own actions as student moves.
 */
import { codapInterface } from '@concord-consortium/codap-plugin-api';

export const PLUGIN_NAME = 'Exploration Sensor';
export const PLUGIN_VERSION = '0.1.0';
const CONNECT_ATTEMPTS = 20;      // ~1 minute in all
const SLOW_AFTER_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const READ_ATTEMPTS = 8;          // ~20 s for a read, while CODAP is busy
const READ_RETRY_DELAY_MS = 500;
// CODAP notifications can trail its replies by seconds when it is busy.
const SELF_QUIET_MS = 3000;

export function createCodapConnection({ dimensions = { width: 400, height: 660 } } = {}) {
  let connected = false;
  let selfDepth = 0;
  let quietUntil = 0;
  const ignoredContexts = new Set();
  const listeners = [];

  const isOwn = (resource) => {
    if (selfDepth > 0 || performance.now() < quietUntil) return true;
    const context = resource.match(/\[(.*)\]/)?.[1];
    return context != null && ignoredContexts.has(context);
  };

  const subscribe = () => codapInterface.on('notify', '*', (notification) => {
    const resource = notification?.resource ?? '';
    if (!isOwn(resource)) {
      const flat = { resource, values: notification?.values ?? {} };
      for (const listener of listeners) listener(flat);
    }
    // codapInterface uses a handler's return value as the reply to CODAP.
    return { success: true };
  });

  return {
    get connected() { return connected; },

    /**
     * Resolves to the saved interactive state once CODAP answers, or null if
     * it never does (the page was opened outside CODAP).
     *
     * iframe-phone abandons a request after 2 s. A small plugin page loads
     * while CODAP is still starting up, and CODAP's first replies can arrive
     * after that, so a timed-out handshake is retried rather than treated as
     * "not in CODAP". (Measured 2026-10-13 on codap3.concord.org v3.1.1: the
     * first handshake timed out on every load; the R sidebar, which loads
     * more slowly, did not hit this.) `onSlow` fires once the first attempts
     * have failed, so the panel can say so while it keeps trying.
     */
    async connect({ onSlow } = {}) {
      for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
        try {
          const state = await codapInterface.init({
            name: PLUGIN_NAME, title: PLUGIN_NAME, version: PLUGIN_VERSION, dimensions,
          });
          connected = true;
          subscribe();
          return state ?? {};
        } catch (error) {
          if (attempt === SLOW_AFTER_ATTEMPTS) onSlow?.();
          if (attempt === CONNECT_ATTEMPTS) {
            console.warn('[exploration-sensor] CODAP did not answer:', error);
          }
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
      return null;
    },

    onNotification(listener) { listeners.push(listener); },

    /**
     * `request('get', 'componentList')` style, as Spirit Animal's fixtures
     * expect. A busy CODAP (e.g. just after 157 cases arrive) can miss
     * iframe-phone's 2 s window, so reads are retried on timeout. Writes are
     * never retried: a late reply can mean the write already happened.
     */
    async request(action, resource, values) {
      if (!connected) return { success: false };
      const message = values === undefined ? { action, resource } : { action, resource, values };
      const attempts = action === 'get' ? READ_ATTEMPTS : 1;
      for (let attempt = 1; ; attempt++) {
        try {
          return await codapInterface.sendRequest(message);
        } catch (error) {
          if (attempt >= attempts || !/timed out/i.test(String(error))) throw error;
          await new Promise((resolve) => setTimeout(resolve, READ_RETRY_DELAY_MS));
        }
      }
    },

    async asSelf(fn) {
      selfDepth++;
      try {
        return await fn();
      } finally {
        selfDepth--;
        quietUntil = performance.now() + SELF_QUIET_MS;
      }
    },

    ignoreContext(name) { ignoredContexts.add(name); },

    saveState(state) {
      if (connected) codapInterface.updateInteractiveState(state);
    },
  };
}
