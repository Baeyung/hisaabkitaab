import { TranslationKey } from '../i18n/translations/en';

/**
 * Why an entry or bill would not delete.
 *
 * A 403 here is always the same wall and deserves to be named: a shared user may take
 * back what they have just booked, but erasing settled history is the owner's call. Any
 * other failure is the caller's own `fallback` — the screens phrase "couldn't delete"
 * differently for an entry and for a bill.
 */
export function deleteErrorKey(err: unknown, fallback: TranslationKey): TranslationKey {
  return (err as { status?: number } | null)?.status === 403 ? 'error.deleteWindow' : fallback;
}
