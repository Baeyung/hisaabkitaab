import { entryDetailLink, entryEditLink, isEditableEntry } from './entry-route';

describe('entryDetailLink', () => {
  it('sends a sale to its bill, a purchase to its record, a processing run to its batch', () => {
    expect(entryDetailLink('SALE', 't1')).toEqual(['bill-management', 't1']);
    expect(entryDetailLink('PURCHASE', 't2')).toEqual(['purchases', 't2']);
    expect(entryDetailLink('PROCESSING', 't3')).toEqual(['processing', 't3']);
  });

  it('leaves a movement with no page of its own unlinked', () => {
    expect(entryDetailLink('OPENING_STOCK', 't4')).toBeNull();
    expect(entryDetailLink('ADJUSTMENT', 't5')).toBeNull();
    expect(entryDetailLink('RECEIPT', 't6')).toBeNull();
  });
});

describe('entryEditLink', () => {
  it('opens the entry screen prefilled, and refuses an opening entry', () => {
    expect(entryEditLink('PURCHASE', 't1')).toEqual(['new-entry', 'purchase', 't1']);
    expect(isEditableEntry('OPENING_BALANCE')).toBe(false);
    expect(entryEditLink('OPENING_BALANCE', 't2')).toBeNull();
  });
});
