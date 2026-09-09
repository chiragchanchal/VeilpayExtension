import { describe, expect, it } from 'vitest';
import { decimalAmountToBaseUnits } from '@/core/chains/amounts';

describe('decimalAmountToBaseUnits', () => {
  it('converts with a custom ERC20 precision (6 decimals, USDC-style)', () => {
    expect(decimalAmountToBaseUnits('1', 6)).toBe(1_000_000n);
    expect(decimalAmountToBaseUnits('0.5', 6)).toBe(500_000n);
    expect(decimalAmountToBaseUnits('123.456', 6)).toBe(123_456_000n);
    expect(decimalAmountToBaseUnits('0.000001', 6)).toBe(1n);
  });

  it('converts with a custom SPL precision (9 decimals)', () => {
    expect(decimalAmountToBaseUnits('1', 9)).toBe(1_000_000_000n);
    expect(decimalAmountToBaseUnits('0.0015', 9)).toBe(1_500_000n);
  });

  it('uses native precision (18 wei) by default when requested', () => {
    expect(decimalAmountToBaseUnits('1', 18)).toBe(10n ** 18n);
    expect(decimalAmountToBaseUnits('0.001', 18)).toBe(10n ** 15n);
  });

  it('truncates fractional digits beyond the token precision (no float rounding)', () => {
    // 6-decimal token: "1.0000009" drops the trailing 9.
    expect(decimalAmountToBaseUnits('1.0000009', 6)).toBe(1_000_000n);
    expect(decimalAmountToBaseUnits('0.9999999999', 6)).toBe(999_999n);
  });

  it('matches the background EVM native + token precision behavior', () => {
    // EVM native: 18 decimals; ERC20: 6; SPL: 9.
    expect(decimalAmountToBaseUnits('0.5', 18)).toBe(500_000_000_000_000_000n);
    expect(decimalAmountToBaseUnits('0.5', 6)).toBe(500_000n);
    expect(decimalAmountToBaseUnits('0.5', 9)).toBe(500_000_000n);
  });

  it('throws on an amount that overflows uint256', () => {
    const huge = '9'.repeat(80);
    expect(() => decimalAmountToBaseUnits(huge, 0)).toThrow();
  });

  it('handles leading zeros and whole-only input', () => {
    expect(decimalAmountToBaseUnits('0', 6)).toBe(0n);
    expect(decimalAmountToBaseUnits('007', 6)).toBe(7_000_000n);
    expect(decimalAmountToBaseUnits('7', 6)).toBe(7_000_000n);
  });
});
