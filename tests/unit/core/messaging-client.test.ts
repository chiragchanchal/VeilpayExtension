import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, MESSAGE_TIMEOUT_MS, RequestFailed } from '@/core/messaging/client';

const validResponse = (data: unknown) => ({
  id: crypto.randomUUID(),
  ok: true as const,
  data,
});

describe('message client timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fails a request when the runtime message never resolves', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      () => new Promise(() => {}) as never,
    );
    const promise = createClient('popup')('vault.status', {});
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'The wallet did not respond in time.',
    });
    await vi.advanceTimersByTimeAsync(MESSAGE_TIMEOUT_MS);
    await assertion;
  });

  it('does not time out a response that arrives before the deadline', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(
      validResponse({ state: 'locked', unlockedUntil: null }) as never,
    );
    await expect(createClient('popup')('vault.status', {})).resolves.toEqual({
      state: 'locked',
      unlockedUntil: null,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('normalizes runtime send failures to RequestFailed', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('channel closed'));
    await expect(createClient('popup')('vault.status', {})).rejects.toBeInstanceOf(RequestFailed);
  });
});
