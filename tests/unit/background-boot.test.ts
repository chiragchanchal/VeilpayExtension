import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/**
 * Service-worker boot test.
 *
 * The black-screen / "did not respond in time" regressions both trace back to
 * the service-worker module graph failing at evaluation time (a TDZ circular
 * import). When that happens the SW never registers its onMessage listener, so
 * every popup request hangs until the client timeout fires.
 *
 * This test imports the REAL background entry module and asserts it evaluates
 * cleanly and wires up its listeners — the exact boot path that failed.
 */

let listenerCallCount: number;

beforeEach(() => {
  listenerCallCount = 0;
  vi.mocked(chrome.runtime.onMessage.addListener).mockImplementation(() => {
    listenerCallCount += 1;
  });
});

afterEach(() => {
  vi.resetModules();
});

it('background module evaluates and registers the message listener', async () => {
  await import('@/background/index');
  expect(listenerCallCount).toBeGreaterThan(0);
  expect(vi.mocked(chrome.runtime.onMessage.addListener)).toHaveBeenCalled();
});
