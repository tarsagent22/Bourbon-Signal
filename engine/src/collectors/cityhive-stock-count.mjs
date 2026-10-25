/** Nonnegative whole-bottle stock scalar only. Strings use decimal grammar;
 * JSON numeric notation has already been parsed, so number100 remains valid.
 * No object coercion, decimal fractions, hex/scientific strings or unsafe ints.
 * Invalid is null, never an inferred negative inventory observation.
 */
export function parseCityHiveStockCount(value) {
  if (typeof value === 'string') {
    const scalar = value.trim();
    if (!/^(?:0|[1-9][0-9]*)$/u.test(scalar)) return null;
    value = Number(scalar);
  }
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
