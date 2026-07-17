/**
 * Today as an ISO `yyyy-MM-dd` string — the wire format `EventRequest.billDate`
 * expects, and the default for every entry screen's date field.
 *
 * Entry screens default to today but stay editable: a batch user keying last
 * night's stack of bills backdates the event without friction
 * (APPLICATION_DOMAIN §7).
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
