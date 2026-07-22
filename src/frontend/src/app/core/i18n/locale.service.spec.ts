import { TestBed } from '@angular/core/testing';
import { LocaleService } from './locale.service';

describe('LocaleService.describe', () => {
  let locale: LocaleService;

  beforeEach(() => {
    // The node test environment has no localStorage; the service only uses it to
    // remember the chosen language.
    (globalThis as { localStorage?: Storage }).localStorage ??= {
      getItem: () => null,
      setItem: () => undefined,
    } as unknown as Storage;
    locale = TestBed.inject(LocaleService);
    locale.setLocale('en');
  });

  it('words a row from its event, party and amount', () => {
    expect(locale.describe('RECEIPT', 'Rana', 5000)).toBe('Received Rs 5,000 from Rana');
    expect(locale.describe('EXPENSE', null, 250)).toBe('Expense of Rs 250');
  });

  it('names the goods when the row carries them', () => {
    expect(locale.describe('SALE', 'Ahsan', 4800, 'Lawn Print × 12')).toBe(
      'Sold Lawn Print × 12 to Ahsan',
    );
    expect(locale.describe('PURCHASE', null, 900, 'Voile, Cambric +2')).toBe(
      'Purchased Voile, Cambric +2',
    );
  });

  it('falls back to the party-less wording when no party is on the row', () => {
    expect(locale.describe('SALE')).toBe('Sale');
    expect(locale.describe('SALE', 'Ahsan')).toBe('Sold to Ahsan');
    // RECEIPT has no items wording — a cash entry moves no goods.
    expect(locale.describe('RECEIPT', null, 500, 'Lawn Print')).toBe('Received Rs 500');
    // OPENING_CASH has no party variant at all, party or not.
    expect(locale.describe('OPENING_CASH', 'Ahsan')).toBe('Opening drawer balance');
  });

  it('re-words itself in Urdu', () => {
    locale.setLocale('ur');
    expect(locale.describe('SALE', 'احسن')).toBe('احسن کو فروخت');
    expect(locale.describe('EXPENSE', null, 250)).toBe('Rs 250 خرچ');
  });
});
