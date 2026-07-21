import { describe, expect, it } from 'vitest';
import { isWineInputValid, validateWineInput } from '../../domain/wine/validation.ts';

const validWine = {
  name: 'Chateau Test',
  vintage: 2019,
  quantity: 2,
  purchase_price: 40,
  category: 'Genuss' as const,
  format: '0.75L' as const,
};

describe('validateWineInput', () => {
  it('accepts a fully valid wine', () => {
    expect(validateWineInput(validWine)).toHaveLength(0);
    expect(isWineInputValid(validWine)).toBe(true);
  });

  it('requires a non-empty name', () => {
    const errors = validateWineInput({ ...validWine, name: '  ' });
    expect(errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('rejects an out-of-range vintage', () => {
    const tooOld = validateWineInput({ ...validWine, vintage: 1800 });
    expect(tooOld.some((e) => e.field === 'vintage')).toBe(true);

    const tooNew = validateWineInput({ ...validWine, vintage: new Date().getFullYear() + 5 });
    expect(tooNew.some((e) => e.field === 'vintage')).toBe(true);
  });

  it('rejects a negative or fractional quantity', () => {
    expect(validateWineInput({ ...validWine, quantity: -1 }).some((e) => e.field === 'quantity')).toBe(true);
    expect(validateWineInput({ ...validWine, quantity: 1.5 }).some((e) => e.field === 'quantity')).toBe(true);
  });

  it('rejects a negative purchase price', () => {
    expect(validateWineInput({ ...validWine, purchase_price: -5 }).some((e) => e.field === 'purchase_price')).toBe(true);
  });

  it('rejects an invalid category or format', () => {
    expect(validateWineInput({ ...validWine, category: 'Nope' as any }).some((e) => e.field === 'category')).toBe(true);
    expect(validateWineInput({ ...validWine, format: '9L' as any }).some((e) => e.field === 'format')).toBe(true);
  });

  it('rejects a drinking window that ends before it starts', () => {
    const errors = validateWineInput({ ...validWine, drink_start: 2030, drink_end: 2025 });
    expect(errors.some((e) => e.field === 'drink_end')).toBe(true);
  });
});
