/**
 * Formats a price held as integer pence, e.g. 350 → "£3.50" and 500 → "£5".
 * Prices are always stored as pence, never as floating-point pounds.
 */
export function formatPence(pence: number): string {
  if (!Number.isSafeInteger(pence) || pence < 0) {
    throw new RangeError(`Price must be a whole, non-negative number of pence: ${pence}`)
  }
  const pounds = Math.floor(pence / 100)
  const rest = pence % 100
  return rest === 0 ? `£${pounds}` : `£${pounds}.${String(rest).padStart(2, '0')}`
}
