import constants from '~~/constants.json'

/**
 * Formats a monetary amount in cents to a localized currency string
 * using Intl.NumberFormat and the currency code from constants.json.
 * Symbol position, decimal separators, and grouping are all browser-localized.
 *
 * @param cents - Amount in cents (e.g., 1500 for €15.00)
 * @param options - Optional formatting options
 * @param options.showDecimals - Include decimal places (defaults to false for whole units)
 * @param options.decimalPlaces - Number of decimal places to show (defaults to 2)
 * @param options.locale - BCP 47 locale string (defaults to browser locale)
 * @returns Formatted currency string (e.g., "€15" or "15,50 €" depending on locale)
 */
export function formatCurrency(
  cents: number,
  options: {
    /** Include decimal places (defaults to false for whole units) */
    showDecimals?: boolean
    /** Number of decimal places to show (defaults to 2) */
    decimalPlaces?: number
    /** BCP 47 locale string (defaults to browser locale) */
    locale?: string
  } = {},
): string {
  const { showDecimals = false, decimalPlaces = 2, locale } = options

  const amount = cents / 100
  const { CODE } = constants.CURRENCY

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: CODE,
    minimumFractionDigits: showDecimals ? decimalPlaces : 0,
    maximumFractionDigits: showDecimals ? decimalPlaces : 0,
  }).format(amount)
}

/**
 * Formats a monetary amount in cents with decimals always shown
 *
 * @param cents - Amount in cents
 * @param decimalPlaces - Number of decimal places (defaults to 2)
 * @returns Formatted currency string with decimals (e.g., "€15.50")
 */
export function formatCurrencyWithDecimals(
  cents: number,
  decimalPlaces: number = 2,
): string {
  return formatCurrency(cents, { showDecimals: true, decimalPlaces })
}

/**
 * Get currency information from constants
 */
export function getCurrencyInfo() {
  return constants.CURRENCY
}
