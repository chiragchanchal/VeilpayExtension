import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * End-to-end message test through the REAL background listener.
 *
 * Imports the actual service-worker entry (which registers `onMessage`) and
 * simulates the popup's `vault.status` call. If the background module graph
 * boots and the handler + storage respond, this proves the SW-side path the
 * popup depends on. The one gap vs real Chrome is fake-indexeddb vs real IDB —
 * so this test also documents that a slow/blocked IndexedDB open is the main
 * remaining environmental risk.
 */

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

let registeredListener: Listener | undefined;

beforeEach(() => {
  registeredListener = undefined;
  vi.mocked(chrome.runtime.onMessage.addListener).mockImplementation((listener) => {
    registeredListener = listener as Listener;
  });
  vi.resetModules();
});

describe('background message path (real module graph)', () => {
  it('answers vault.status through the registered listener', async () => {
    await import('@/background/index');

    expect(registeredListener).toBeDefined();

    const sender = {
      origin: 'chrome-extension://veilpay-test',
      url: 'chrome-extension://veilpay-test/popup.html',
    } as chrome.runtime.MessageSender;

    const response = await new Promise<unknown>((resolve) => {
      registeredListener?.(
        { id: crypto.randomUUID(), v: 1, source: 'popup', kind: 'vault.status', payload: {} },
        sender,
        resolve,
      );
    });

    expect(response).toMatchObject({ ok: true });
    const data = (response as { data: { state: string } }).data;
    expect(['uninitialized', 'locked', 'unlocked']).toContain(data.state);
  });

  it('answers zk.capability (returns null on a fresh vault)', async () => {
    await import('@/background/index');

    const sender = {
      origin: 'chrome-extension://veilpay-test',
      url: 'chrome-extension://veilpay-test/popup.html',
    } as chrome.runtime.MessageSender;

    const response = await new Promise<unknown>((resolve) => {
      registeredListener?.(
        { id: crypto.randomUUID(), v: 1, source: 'popup', kind: 'zk.capability', payload: {} },
        sender,
        resolve,
      );
    });

    expect(response).toMatchObject({ ok: true, data: null });
  });
});
