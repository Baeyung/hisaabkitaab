/**
 * Processed goods — a batch of raw material and consumables turned into a different item.
 * Mirrors the backend `dto/processing` (`/api/stores/{storeId}/processing`).
 *
 * The three sides are separate lists rather than one item list because they play different
 * parts: raw and processing rows only contribute cost, and only the output row's price is
 * derived from them. Raw rows are never catalogue items — they hold no stock and have no
 * price list, so they exist only as a cost on the entry.
 */
export interface ProcessingRequest {
  rawItems: ProcessingRaw[];
  processingItems: ProcessingInput[];
  output: ProcessingOutput;
  billNumber: string | null;
  billDate: string | null;
  description: string | null;
  /**
   * Who the batch was run for, or null. Carries no money: the entry shows in that party's
   * khata and links back to itself, but leaves their baqaya where it was (see the backend
   * `ProcessingService`).
   */
  party: { partyId: string | null; name: string } | null;
}

/** A raw material: named and priced, but not an item — nothing to match against. */
export interface ProcessingRaw {
  name: string;
  unit: string | null;
  quantity: number;
  pricePerUnit: number;
}

/** A consumable taken out of stock — `itemId` null when the typed name is new. */
export interface ProcessingInput extends ProcessingRaw {
  itemId: string | null;
}

/**
 * What the batch produced, added to stock. `unitCost` is what the screen computed — total
 * input cost ÷ output quantity — or whatever was typed over it; either way it is the figure
 * the item's cost price is averaged against.
 */
export interface ProcessingOutput {
  itemId: string | null;
  name: string;
  unit: string | null;
  quantity: number;
  unitCost: number;
  wastage: number;
}

/** One recorded batch, read back for the list screen. */
export interface ProcessingRow {
  transactionId: string;
  date: string;
  billNumber: string | null;
  description: string | null;
  partyId: string | null;
  partyName: string | null;
  partyContact: string | null;
  rawItems: ProcessingRowInput[];
  processingItems: ProcessingRowInput[];
  output: ProcessingRowOutput | null;
  /** Whether a non-owner may still take this entry back (24h from booking). */
  recent: boolean;
}

export interface ProcessingRowInput {
  name: string;
  unit: string | null;
  quantity: number | null;
  pricePerUnit: number | null;
}

export interface ProcessingRowOutput {
  itemId: string | null;
  name: string;
  unit: string | null;
  quantity: number | null;
  unitCost: number | null;
  wastage: number | null;
}
