import { describe, expect, it, vi } from 'vitest';
import { parseBarcodeResult } from '../../services/scanner.ts';

describe('scanner service', () => {
  it('returns a local barcode result without a network request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    expect(parseBarcodeResult('4006381333931')).toEqual({
      type: 'barcode',
      raw: '4006381333931',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
