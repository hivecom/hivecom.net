import constants from '~/constants.json'

/**
 * Formats a monetary amount in cents to a localized currency string
 * using the currency configuration from constants.json
 *
 * @param cents - Amount in cents (e.g., 1500 for €15.00)
 * @param options - Optional formatting options
 * @param options.showDecimals - Include decimal places (defaults to false for whole euros)
 * @param options.decimalPlaces - Number of decimal places to show (defaults to 2)
 * @returns Formatted currency string (e.g., "€15")
 */
export function formatCurrency(
  cents: number,
  options: {
    /** Include decimal places (defaults to false for whole euros) */
    showDecimals?: boolean
    /** Number of decimal places to show (defaults to 2) */
    decimalPlaces?: number
  } = {},
): string {
  const { showDecimals = false, decimalPlaces = 2 } = options

  // Convert cents to main currency unit
  const amount = cents / 100

  // Get currency symbol from constants
  const { SYMBOL } = constants.CURRENCY

  // Format the amount based on options
  if (showDecimals) {
    return `${SYMBOL}${amount.toFixed(decimalPlaces)}`
  }
  else {
    // Default behavior: show whole euros only
    return `${SYMBOL}${amount.toFixed(0)}`
  }
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
