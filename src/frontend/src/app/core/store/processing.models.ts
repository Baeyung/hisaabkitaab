/**
 * Processed goods — a batch of raw material and consumables turned into a different item.
 * Mirrors the backend `dto/processing` (`/api/stores/{storeId}/processing`).
 *
 * The two input sides are separate lists because the screen asks for them separately; the
 * arithmetic treats them alike. Both come off the shelf, and a row with a `party` is bought
 * in first — the backend posts an ordinary purchase for it, so the goods arrive and are then
 * consumed by the batch, leaving stock where it started.
 */
export interface ProcessingRequest {
  rawItems: ProcessingInput[];
  processingItems: ProcessingInput[];
  output: ProcessingOutput;
  billNumber: string | null;
  billDate: string | null;
  description: string | null;
}

/**
 * One input row, taken out of stock — `itemId` null when the typed name is new.
 *
 * With a `party` the row is bought in for the batch: the backend posts a plain PURCHASE
 * for it (one per supplier, over all their rows), so it lands in their khata, `paid` leaves
 * the drawer and the rest stays owing.
 */
export interface ProcessingInput {
  itemId: string | null;
  name: string;
  unit: string | null;
  quantity: number;
  pricePerUnit: number;
  party: { partyId: string | null; name: string } | null;
  paid: number | null;
  /**
   * Work rather than goods — dyeing charges, labour. Marks the catalogue item as a service, so
   * no stock is kept for it anywhere; the row still costs the batch and still bills its supplier.
   */
  service: boolean;
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
  /** Only set on batches booked before the party moved onto the rows; null on new ones. */
  partyId: string | null;
  partyName: string | null;
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
  /** Who the row was bought from, when it was bought in rather than taken off the shelf. */
  partyId: string | null;
  partyName: string | null;
}

export interface ProcessingRowOutput {
  itemId: string | null;
  name: string;
  unit: string | null;
  quantity: number | null;
  unitCost: number | null;
  wastage: number | null;
}
