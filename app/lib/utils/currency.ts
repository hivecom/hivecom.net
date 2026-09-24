import constants from '~~/constants.json'

/** Currency code from constants.json, everything else browser-localized. */
export function formatCurrency(
  cents: number,
  options: {
    /** Defaults to false, whole units only. */
    showDecimals?: boolean

    /** Defaults to 2. */
    decimalPlaces?: number

    /** BCP 47, defaults to the browser locale. */
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

export function formatCurrencyWithDecimals(
  cents: number,
  decimalPlaces: number = 2,
): string {
  return formatCurrency(cents, { showDecimals: true, decimalPlaces })
}

/** Takes whole units, not cents. */
export function formatCurrencyUnits(
  amount: number,
  options: {
    showDecimals?: boolean
    decimalPlaces?: number
    locale?: string
  } = {},
): string {
  return formatCurrency(amount * 100, options)
}

export function getCurrencyInfo() {
  return constants.CURRENCY
}
