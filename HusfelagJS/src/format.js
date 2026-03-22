/**
 * Icelandic number formatting:
 *   Thousands separator: . (dot)
 *   Decimal separator:   , (comma)
 *
 *   Amounts:      #.##0        e.g. 981.500 kr.
 *   Percentages:  #0,00%       e.g. 33,33%
 */

/** Format integer with . as thousands separator */
function intWithDots(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Format decimal with , as decimal separator and . as thousands separator */
function decimalWithComma(n, decimals) {
    const [int, dec] = n.toFixed(decimals).split('.');
    const intPart = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${intPart},${dec}`;
}

/** Format a kennitala as "000000-0000" */
export function fmtKennitala(kt) {
    const s = String(kt || '').replace(/\D/g, '');
    if (s.length !== 10) return s || '—';
    return `${s.slice(0, 6)}-${s.slice(6)}`;
}

/** Format a currency amount as "981.500 kr." */
export function fmtAmount(n) {
    return intWithDots(parseFloat(n) || 0) + ' kr.';
}

/**
 * Format a phone number as "000 0000" or "+### 000 0000".
 * Country code is preserved only when the input starts with "+".
 * Local part (last 7 digits) is always formatted as "000 0000".
 * Returns the raw input unchanged if fewer than 7 digits are found.
 */
export function fmtPhone(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    const hasPlus = s.startsWith('+');
    const digits = s.replace(/\D/g, '');
    if (digits.length < 7) return s;
    const local = digits.slice(-7);
    const localFmt = `${local.slice(0, 3)} ${local.slice(3)}`;
    if (hasPlus && digits.length > 7) {
        const cc = digits.slice(0, digits.length - 7);
        return `+${cc} ${localFmt}`;
    }
    return localFmt;
}

/** Format a percentage value as "33,33%" */
export function fmtPct(n) {
    return decimalWithComma(parseFloat(n) || 0, 2) + '%';
}
