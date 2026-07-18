/**
 * Today as an ISO `yyyy-MM-dd` string — the wire format `EventRequest.billDate`
 * expects, and the default for every entry screen's date field.
 *
 * Entry screens default to today but stay editable: a batch user keying last
 * night's stack of bills backdates the event without friction
 * (APPLICATION_DOMAIN §7).
 */
export function todayIso(): string {
  // Local calendar day, NOT UTC — toISOString() would roll to yesterday for
  // the early-morning hours east of UTC (e.g. 04:06 in Pakistan = 23:06 UTC).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
