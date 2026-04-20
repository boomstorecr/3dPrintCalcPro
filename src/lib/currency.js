/**
 * Centralized currency formatting utilities.
 */

export const CURRENCY_OPTIONS = [
  { label: 'USD - US Dollar', value: 'USD' },
  { label: 'EUR - Euro', value: 'EUR' },
  { label: 'GBP - British Pound', value: 'GBP' },
  { label: 'MXN - Mexican Peso', value: 'MXN' },
  { label: 'CRC - Costa Rican Colón', value: 'CRC' },
  { label: 'BRL - Brazilian Real', value: 'BRL' },
  { label: 'CAD - Canadian Dollar', value: 'CAD' },
  { label: 'AUD - Australian Dollar', value: 'AUD' },
  { label: 'JPY - Japanese Yen', value: 'JPY' },
  { label: 'CNY - Chinese Yuan', value: 'CNY' },
];

/**
 * Format a number as currency using Intl.NumberFormat.
 * @param {number} value
 * @param {string} currency - ISO 4217 code (default 'USD')
 * @param {string} locale - BCP 47 locale (optional, defaults to browser)
 * @returns {string}
 */
export function formatCurrency(value, currency = 'USD', locale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value ?? 0);
}

/**
 * Get just the currency symbol for a given currency code.
 * @param {string} currency - ISO 4217 code
 * @param {string} locale
 * @returns {string}
 */
export function getCurrencySymbol(currency = 'USD', locale) {
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(0);
  return formatted.replace(/[\d.,\s]/g, '').trim();
}
