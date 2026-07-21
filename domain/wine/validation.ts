import { BottleFormat, Category, Wine } from '../../types.ts';

export interface WineValidationError {
  field: string;
  message: string;
}

const VALID_CATEGORIES: Category[] = ['Genuss', 'Investment', 'Rarität', 'Daily Drinker'];
const VALID_FORMATS: BottleFormat[] = [
  '0.375L',
  '0.75L',
  '1.5L (Magnum)',
  '3.0L (Double Magnum)',
  '6.0L (Imperial)',
];

const MIN_VINTAGE_YEAR = 1900;

/**
 * Central validation for a wine record before it is saved, used consistently
 * by manual entry, scan entry, and JSON/CSV import instead of scattered
 * ad hoc checks in each entry point.
 */
export const validateWineInput = (input: Partial<Wine>): WineValidationError[] => {
  const errors: WineValidationError[] = [];
  const currentYear = new Date().getFullYear();

  if (!input.name || !input.name.trim()) {
    errors.push({ field: 'name', message: 'Name ist erforderlich.' });
  }

  if (typeof input.vintage !== 'number' || !Number.isInteger(input.vintage)) {
    errors.push({ field: 'vintage', message: 'Jahrgang ist erforderlich.' });
  } else if (input.vintage < MIN_VINTAGE_YEAR || input.vintage > currentYear + 1) {
    errors.push({
      field: 'vintage',
      message: `Jahrgang muss zwischen ${MIN_VINTAGE_YEAR} und ${currentYear + 1} liegen.`,
    });
  }

  if (typeof input.quantity !== 'number' || !Number.isInteger(input.quantity) || input.quantity < 0) {
    errors.push({ field: 'quantity', message: 'Menge muss eine ganze Zahl ≥ 0 sein.' });
  }

  if (typeof input.purchase_price !== 'number' || Number.isNaN(input.purchase_price) || input.purchase_price < 0) {
    errors.push({ field: 'purchase_price', message: 'Kaufpreis muss eine Zahl ≥ 0 sein.' });
  }

  if (input.market_price !== undefined && (typeof input.market_price !== 'number' || input.market_price < 0)) {
    errors.push({ field: 'market_price', message: 'Marktwert muss eine Zahl ≥ 0 sein.' });
  }

  if (input.category !== undefined && !VALID_CATEGORIES.includes(input.category)) {
    errors.push({ field: 'category', message: `Kategorie muss eine von: ${VALID_CATEGORIES.join(', ')} sein.` });
  }

  if (input.format !== undefined && !VALID_FORMATS.includes(input.format)) {
    errors.push({ field: 'format', message: `Format muss eine von: ${VALID_FORMATS.join(', ')} sein.` });
  }

  if (typeof input.drink_start === 'number' && typeof input.drink_end === 'number' && input.drink_end < input.drink_start) {
    errors.push({ field: 'drink_end', message: 'Trinkfenster-Ende darf nicht vor dem Beginn liegen.' });
  }

  return errors;
};

export const isWineInputValid = (input: Partial<Wine>): boolean => validateWineInput(input).length === 0;
