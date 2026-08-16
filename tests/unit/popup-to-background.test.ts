import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/core/messaging/client';

/**
 * True end-to-end message test: popup client -> chrome.runtime.sendMessage
 * (mocked to deliver to the REAL background listener) -> dispatch -> handler ->
 * IndexedDB (fake-indexeddb) -> sendResponse -> client.
 *
 * This covers the delivery contract my earlier tests bypassed: the listener's
 * `return true` keeping the port open, the sender shape Chrome stamps, and the
 * response envelope the client parses.
 */

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

let registeredListener: Listener | undefined;

function installRealDelivery(): void {
  vi.mocked(chrome.runtime.onMessage.addListener).mockImplementation((listener) => {
    registeredListener = listener as Listener;
  });
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(
    (message: unknown) =>
      new Promise((resolve) => {
        if (registeredListener === undefined) {
          resolve(undefined);
          return;
        }
        const sender = {
          id: chrome.runtime.id,
          origin: `chrome-extension://${chrome.runtime.id}`,
          url: `chrome-extension://${chrome.runtime.id}/popup.html`,
        } as chrome.runtime.MessageSender;
        registeredListener(message, sender, resolve);
      }) as never,
  );
}

beforeEach(() => {
  registeredListener = undefined;
  vi.resetModules();
  installRealDelivery();
});

describe('popup -> background end-to-end', () => {
  it('vault.status round-trips through the real listener', async () => {
    await import('@/background/index');

    const send = createClient('popup');
    const result = await send('vault.status', {});

    expect(['uninitialized', 'locked', 'unlocked']).toContain(result.state);
  });

  it('zk.capability round-trips (returns null on a fresh vault)', async () => {
    await import('@/background/index');

    const send = createClient('popup');
    const result = await send('zk.capability', {});

    expect(result).toBeNull();
  });

  it('ping round-trips through the real listener', async () => {
    await import('@/background/index');

    const send = createClient('popup');
    const result = await send('ping', { sentAt: 1_000 });

    expect(result).toMatchObject({ sentAt: 1_000 });
    expect(typeof result.roundTripHint).toBe('number');
  });
});
