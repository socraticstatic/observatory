import { describe, it, expect } from 'vitest';
import { lookbackToInterval, LookbackSchema } from '../lib/lookback';

describe('lookbackToInterval', () => {
  it('maps 1H to 1 hour', () => expect(lookbackToInterval('1H')).toBe('1 hour'));
  it('maps 24H to 24 hours', () => expect(lookbackToInterval('24H')).toBe('24 hours'));
  it('maps 30D to 30 days', () => expect(lookbackToInterval('30D')).toBe('30 days'));
});

describe('LookbackSchema', () => {
  it('rejects invalid values', () => {
    expect(() => LookbackSchema.parse('7D')).toThrow();
  });
});
