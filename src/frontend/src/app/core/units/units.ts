/**
 * What one unit is worth in another — the fixed half, which is the same in every shop on
 * earth and so lives here rather than in anybody's database.
 *
 * Stock is kept in the unit named on the catalogue item. That unit is the base: every
 * quantity the backend is sent has to already be in it, because nothing back there converts
 * anything (see `UnitConversionService`). A shop that buys greige by the metre and shelves it
 * by the gaz does the arithmetic here, in front of the shopkeeper, and posts the answer.
 *
 * Two kinds of unit, and only one of them can be tabulated:
 *
 * - **Measures** — metre, gaz, kilo, gram, dozen. A gaz is thirty-six inches in Karachi and
 *   thirty-six inches in Lahore, so {@link BUILT_IN} can simply say so.
 * - **Trade units** — than, roll, bori, carton. A than is however many metres that mill winds
 *   onto a bolt, and no table can know it. Those are deliberately absent from {@link BUILT_IN}
 *   and are answered by the shop, once, through the conversion slip — see
 *   `UnitConversionService` on the frontend for how the two sources are merged.
 *
 * Nothing in this file touches Angular, so it is all plainly testable; see units.spec.ts.
 */

/**
 * The families a measure belongs to. Conversion only ever happens inside one — there is no
 * factor from kilograms to metres, and a shop asking for one is told to type its own, because
 * "a metre of this cloth weighs 120 grams" is a fact about the cloth, not about the units.
 */
export type UnitDimension = 'length' | 'weight' | 'volume' | 'count';

/** Where a factor came from, so the slip can say so rather than presenting a bare number. */
export type FactorSource = 'standard' | 'shop' | 'derived' | 'typed';

export interface UnitFactor {
  /** Multiply a quantity in the `from` unit by this to get it in the `to` unit. */
  value: number;
  source: FactorSource;
  /**
   * For a `derived` factor, the units it was chained through — "than → metre → gaz". The slip
   * shows this, because a rate nobody typed needs to account for itself.
   */
  via?: string[];
}

/**
 * A measure: which family it belongs to, and how many of the family's base unit it makes.
 * The base is whichever member has a `base` of 1 — metre, kilogram, litre, piece.
 */
interface Measure {
  dimension: UnitDimension;
  base: number;
}

/**
 * Every spelling of a measure a shopkeeper might type, folded, against its value in the
 * family's base unit. Roman-Urdu spellings sit beside the English ones because both get typed
 * into the same box — "gaz" and "yard" are the same thirty-six inches, and the shop that
 * writes one should not be asked to convert to the other.
 *
 * The awkward-looking exact decimals are exact on purpose: a gaz is 0.9144 m by definition
 * (36 international inches), not by measurement, and rounding it here would put a slow drift
 * into every batch of cloth the shop ever processes.
 */
const BUILT_IN: Readonly<Record<string, Measure>> = {
  // ── length, base metre ──────────────────────────────────────────────────
  meter: { dimension: 'length', base: 1 },
  metre: { dimension: 'length', base: 1 },
  meters: { dimension: 'length', base: 1 },
  metres: { dimension: 'length', base: 1 },
  m: { dimension: 'length', base: 1 },
  mtr: { dimension: 'length', base: 1 },
  centimeter: { dimension: 'length', base: 0.01 },
  centimetre: { dimension: 'length', base: 0.01 },
  cm: { dimension: 'length', base: 0.01 },
  millimeter: { dimension: 'length', base: 0.001 },
  millimetre: { dimension: 'length', base: 0.001 },
  mm: { dimension: 'length', base: 0.001 },
  kilometer: { dimension: 'length', base: 1000 },
  kilometre: { dimension: 'length', base: 1000 },
  km: { dimension: 'length', base: 1000 },
  // A gaz is a yard: 36 inches exactly. The two names are one measure.
  gaz: { dimension: 'length', base: 0.9144 },
  gaj: { dimension: 'length', base: 0.9144 },
  guz: { dimension: 'length', base: 0.9144 },
  yard: { dimension: 'length', base: 0.9144 },
  yards: { dimension: 'length', base: 0.9144 },
  yd: { dimension: 'length', base: 0.9144 },
  foot: { dimension: 'length', base: 0.3048 },
  feet: { dimension: 'length', base: 0.3048 },
  ft: { dimension: 'length', base: 0.3048 },
  inch: { dimension: 'length', base: 0.0254 },
  inches: { dimension: 'length', base: 0.0254 },

  // ── weight, base kilogram ───────────────────────────────────────────────
  kilogram: { dimension: 'weight', base: 1 },
  kilo: { dimension: 'weight', base: 1 },
  kg: { dimension: 'weight', base: 1 },
  kgs: { dimension: 'weight', base: 1 },
  gram: { dimension: 'weight', base: 0.001 },
  grams: { dimension: 'weight', base: 0.001 },
  gm: { dimension: 'weight', base: 0.001 },
  g: { dimension: 'weight', base: 0.001 },
  milligram: { dimension: 'weight', base: 0.000001 },
  mg: { dimension: 'weight', base: 0.000001 },
  // Pakistan's metric seer and maund: 1 seer = 1 kg, 1 maund = 40 seer, fixed by statute.
  seer: { dimension: 'weight', base: 1 },
  ser: { dimension: 'weight', base: 1 },
  maund: { dimension: 'weight', base: 40 },
  mann: { dimension: 'weight', base: 40 },
  quintal: { dimension: 'weight', base: 100 },
  ton: { dimension: 'weight', base: 1000 },
  tonne: { dimension: 'weight', base: 1000 },
  tola: { dimension: 'weight', base: 0.0116638 },
  pound: { dimension: 'weight', base: 0.45359237 },
  lb: { dimension: 'weight', base: 0.45359237 },
  lbs: { dimension: 'weight', base: 0.45359237 },
  ounce: { dimension: 'weight', base: 0.028349523125 },
  oz: { dimension: 'weight', base: 0.028349523125 },

  // ── volume, base litre ──────────────────────────────────────────────────
  // Gallon is deliberately absent: the imperial one and the US one differ by a fifth, and
  // guessing which a shop means is worse than asking.
  liter: { dimension: 'volume', base: 1 },
  litre: { dimension: 'volume', base: 1 },
  liters: { dimension: 'volume', base: 1 },
  litres: { dimension: 'volume', base: 1 },
  ltr: { dimension: 'volume', base: 1 },
  l: { dimension: 'volume', base: 1 },
  milliliter: { dimension: 'volume', base: 0.001 },
  millilitre: { dimension: 'volume', base: 0.001 },
  ml: { dimension: 'volume', base: 0.001 },

  // ── count, base piece ───────────────────────────────────────────────────
  piece: { dimension: 'count', base: 1 },
  pieces: { dimension: 'count', base: 1 },
  pc: { dimension: 'count', base: 1 },
  pcs: { dimension: 'count', base: 1 },
  adad: { dimension: 'count', base: 1 },
  nag: { dimension: 'count', base: 1 },
  pair: { dimension: 'count', base: 2 },
  jora: { dimension: 'count', base: 2 },
  dozen: { dimension: 'count', base: 12 },
  darjan: { dimension: 'count', base: 12 },
  dz: { dimension: 'count', base: 12 },
  gross: { dimension: 'count', base: 144 },
};

/**
 * What the unit boxes offer. Measures the table knows come first in the spellings a shop is
 * most likely to want; the trade units follow, and are exactly the ones {@link BUILT_IN} has
 * no opinion on — offering them is how the shopkeeper finds out they are allowed to type one.
 */
export const UNIT_SUGGESTIONS: readonly string[] = [
  'Meter',
  'Gaz',
  'Yard',
  'Inch',
  'Foot',
  'Kg',
  'Gram',
  'Maund',
  'Tola',
  'Litre',
  'Piece',
  'Dozen',
  'Pair',
  // No fixed rate — the shop teaches these the first time it uses one.
  'Than',
  'Roll',
  'Bundle',
  'Bori',
  'Carton',
  'Box',
  'Bale',
  'Packet',
];

/**
 * A handful of the fixed table's rates, picked to show a shopkeeper what "a conversion" looks
 * like before they have taught the app any of their own — g → kg, gaz → metre, dozen → piece.
 * Shown for reference on the Store Settings conversions screen; nothing to add for these, since
 * {@link BUILT_IN} already answers them everywhere, for free.
 */
export const EXAMPLE_CONVERSIONS: readonly { from: string; to: string }[] = [
  { from: 'gram', to: 'kilogram' },
  { from: 'gaz', to: 'meter' },
  { from: 'inch', to: 'foot' },
  { from: 'tola', to: 'gram' },
  { from: 'maund', to: 'kilogram' },
  { from: 'milliliter', to: 'liter' },
  { from: 'dozen', to: 'piece' },
];

/**
 * Trade units with no fixed rate — the ones a shop actually has to teach, offered on the same
 * screen as a shortcut into the "add conversion" form. Only the pair is a suggestion; the rate
 * itself is never guessed, only asked for.
 */
export const TRADE_UNIT_EXAMPLES: readonly { from: string; to: string }[] = [
  { from: 'than', to: 'meter' },
  { from: 'bori', to: 'kilogram' },
  { from: 'roll', to: 'meter' },
  { from: 'bale', to: 'kilogram' },
  { from: 'carton', to: 'piece' },
  { from: 'packet', to: 'piece' },
];

/**
 * How a unit is keyed everywhere: trimmed and lower-cased, so "Meter", "meter" and " METER "
 * are one unit. Matches `UnitConversionService.fold` on the backend, which has to agree with
 * this or a rate taught under one spelling would be invisible under another.
 */
export function foldUnit(unit: string | null | undefined): string {
  return (unit ?? '').trim().toLowerCase();
}

/** The family a measure belongs to, or null for a trade unit the table has no opinion on. */
export function unitDimension(unit: string | null | undefined): UnitDimension | null {
  return BUILT_IN[foldUnit(unit)]?.dimension ?? null;
}

/** Whether the table can convert this unit without being taught anything. */
export function isKnownUnit(unit: string | null | undefined): boolean {
  return foldUnit(unit) in BUILT_IN;
}

/**
 * The fixed rate between two measures of the same family, or null when either is a trade unit
 * or they belong to different families. Length÷length cancels, so the base drops out and what
 * is left is how many `to` there are in one `from`.
 */
export function builtInFactor(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  const a = BUILT_IN[foldUnit(from)];
  const b = BUILT_IN[foldUnit(to)];
  if (!a || !b || a.dimension !== b.dimension) {
    return null;
  }
  return a.base / b.base;
}

/**
 * Whether two units are the same unit. Blank counts as "unknown", not as a unit, so it never
 * matches anything — an item with no unit set has nothing to convert to and is left alone.
 */
export function sameUnit(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = foldUnit(a);
  return x.length > 0 && x === foldUnit(b);
}

/**
 * A converted quantity, rounded the way the shelf rounds it.
 *
 * `transaction_lines.quantity` is `numeric(38,2)`, so two decimals is not a display choice —
 * it is what will actually be stored. Rounding here means the figure the shopkeeper approves
 * in the slip is the figure that lands in stock, rather than one that quietly gains or loses
 * a hundredth on the way down.
 */
export function convertQty(qty: number, factor: number): number {
  return Math.round(qty * factor * 100) / 100;
}

/**
 * A factor for the slip to show: enough places to be honest about a rate like 1/22, without
 * spelling out the full binary expansion of 0.045454545454545456.
 */
export function formatFactor(factor: number): string {
  const rounded = Number(factor.toPrecision(8));
  return String(rounded);
}

/**
 * Money precision — the same rounding {@link convertQty} does, under its own name so a rate
 * being rescaled by a factor doesn't read as a quantity being converted. Without it, a taught
 * rate's own inversion (1/x) leaves a rescaled rate reading 2099.9999999999995 for a shopkeeper
 * who plainly typed 2100.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** One rate the shop taught us, as {@link resolveFactor} needs it: `1 fromUnit = factor toUnit`. */
export interface TaughtRate {
  fromUnit: string;
  toUnit: string;
  factor: number;
}

/**
 * A taught rate the way a shopkeeper reads it back, not the way the backend files it.
 * `UnitConversionService` on the backend sorts every pair alphabetically before storing it, so
 * "1 than = 21 gaz" and "1 gaz = 0.0476 than" are one row either way — correct for not storing
 * the same fact twice, but the row a shop taught as "1 than = 21 gaz" would otherwise redisplay
 * as the alphabetically-earlier "gaz". A rate and its inverse are the same fact, so picking
 * whichever direction keeps the factor at 1 or above is free: it costs nothing to compute and
 * turns the row back into the "one big unit = many small units" sentence a shop actually typed.
 */
export function readableRate<T extends TaughtRate>(rate: T): T {
  return rate.factor >= 1
    ? rate
    : { ...rate, fromUnit: rate.toUnit, toUnit: rate.fromUnit, factor: 1 / rate.factor };
}

/**
 * How far a chained rate may wander. Two hops covers the case that matters — a trade unit the
 * shop taught against one measure, converted into another measure of the same family ("than →
 * metre → gaz") — and stopping there keeps the slip's `via` line short enough to read and to
 * disbelieve. A shop is better served by being asked than by being handed a number assembled
 * out of five other numbers.
 */
const MAX_HOPS = 3;

/**
 * The rate between two units, given what this shop has taught us — the whole lookup, in the
 * order the answers deserve to be trusted:
 *
 * 1. **The shop's own word for this exact pair.** A shop that says its gaz is 0.91 m outranks
 *    the table that says 0.9144, because it is their cloth and their gaz.
 * 2. **The fixed table**, when both are measures of one family.
 * 3. **A chain** through one of the shop's rates into the table — "1 than = 22 metre" plus
 *    "1 metre = 1.0936 gaz" answers than → gaz without anyone being asked twice.
 *
 * Returns null when there is no honest answer, which is the common and correct outcome for a
 * pair like carton → kilogram: the slip then asks, and the answer becomes rule 1 next time.
 */
export function resolveFactor(
  from: string | null | undefined,
  to: string | null | undefined,
  taught: readonly TaughtRate[] = [],
): UnitFactor | null {
  const a = foldUnit(from);
  const b = foldUnit(to);
  if (!a || !b) {
    return null;
  }
  if (a === b) {
    return { value: 1, source: 'standard' };
  }

  const direct = taught.find(
    (r) =>
      (foldUnit(r.fromUnit) === a && foldUnit(r.toUnit) === b) ||
      (foldUnit(r.fromUnit) === b && foldUnit(r.toUnit) === a),
  );
  if (direct) {
    const forward = foldUnit(direct.fromUnit) === a;
    return { value: forward ? direct.factor : 1 / direct.factor, source: 'shop' };
  }

  const fixed = builtInFactor(a, b);
  if (fixed !== null) {
    return { value: fixed, source: 'standard' };
  }

  return chain(a, b, taught);
}

/**
 * Breadth-first over the rates that exist, shortest path first, so a two-hop answer is only
 * reached when there is no one-hop one.
 *
 * Edges are the shop's rates (usable both ways — a rate is symmetric) plus, for any measure
 * the table knows, an edge to every other measure of its family. That second set is what lets
 * a chain land: the shop taught than → metre, and the table carries it the rest of the way to
 * gaz without another question.
 */
function chain(from: string, to: string, taught: readonly TaughtRate[]): UnitFactor | null {
  const edges = new Map<string, { to: string; factor: number }[]>();
  const add = (a: string, b: string, factor: number): void => {
    if (!Number.isFinite(factor) || factor <= 0) {
      return;
    }
    edges.set(a, [...(edges.get(a) ?? []), { to: b, factor }]);
  };

  for (const rate of taught) {
    const a = foldUnit(rate.fromUnit);
    const b = foldUnit(rate.toUnit);
    if (a && b && a !== b) {
      add(a, b, rate.factor);
      add(b, a, 1 / rate.factor);
    }
  }

  // Every taught unit that is also a measure gets the table's edges out of it, and so does the
  // destination — that is the hop that finishes the chain.
  const reachable = new Set([from, to, ...edges.keys()]);
  for (const a of reachable) {
    for (const b of reachable) {
      if (a === b) {
        continue;
      }
      const fixed = builtInFactor(a, b);
      if (fixed !== null) {
        add(a, b, fixed);
      }
    }
  }

  const queue: { unit: string; factor: number; via: string[] }[] = [
    { unit: from, factor: 1, via: [from] },
  ];
  const seen = new Set([from]);

  while (queue.length > 0) {
    const step = queue.shift()!;
    if (step.via.length > MAX_HOPS) {
      continue;
    }
    for (const edge of edges.get(step.unit) ?? []) {
      if (edge.to === to) {
        return { value: step.factor * edge.factor, source: 'derived', via: [...step.via, to] };
      }
      if (!seen.has(edge.to)) {
        seen.add(edge.to);
        queue.push({
          unit: edge.to,
          factor: step.factor * edge.factor,
          via: [...step.via, edge.to],
        });
      }
    }
  }

  return null;
}
