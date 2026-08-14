import { beforeEach, describe, expect, it } from 'vitest';
import {
  allowPrompt,
  clearPromptHistory,
  MAX_PROMPTS_PER_MINUTE,
} from '@/background/prompt-limiter';

beforeEach(() => {
  clearPromptHistory();
});

describe('prompt limiter', () => {
  it('allows the first five prompts per origin and denies the sixth', () => {
    for (let i = 0; i < MAX_PROMPTS_PER_MINUTE; i += 1) {
      expect(allowPrompt('https://a.example', 1_000 + i)).toBe(true);
    }
    expect(allowPrompt('https://a.example', 1_005)).toBe(false);
  });

  it('resets once the rolling minute elapses', () => {
    for (let i = 0; i < MAX_PROMPTS_PER_MINUTE; i += 1) {
      expect(allowPrompt('https://a.example', 1_000 + i)).toBe(true);
    }
    // 61 seconds after the first prompt: a fresh slot is available.
    expect(allowPrompt('https://a.example', 1_000 + 61_000)).toBe(true);
  });

  it('tracks origins independently', () => {
    for (let i = 0; i < MAX_PROMPTS_PER_MINUTE; i += 1) {
      allowPrompt('https://a.example', 1_000 + i);
    }
    expect(allowPrompt('https://b.example', 1_005)).toBe(true);
  });
});
