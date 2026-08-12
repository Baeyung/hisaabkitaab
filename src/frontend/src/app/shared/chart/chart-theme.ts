/**
 * Chart colours and axis formatting, shared by every screen that draws one.
 *
 * A canvas can't read a CSS custom property, so the palette is mirrored here — once per
 * theme, keyed the same way styles.css is. Callers pick through `PALETTES[theme.resolved()]`
 * inside a `computed`, so a theme change rebuilds the config and ChartView redraws.
 *
 * This lives in shared/ rather than beside the dashboard because the store-comparison screen
 * needs the same colours and the same axis ticks; importing them from the dashboard component
 * would drag that whole lazy-loaded component into another route's bundle.
 */
export const FONT = "'IBM Plex Sans', system-ui, sans-serif";

export interface ChartPalette {
  green: string; //  money in / revenue / receivable
  red: string; //    money out / spend / payable / expenses
  blue: string; //   running cash balance (neutral, not a money-in/out signal)
  amber: string; //  aging warning — dues 30–60 days old
  ink: string; //    legend text
  muted: string; //  axis labels
  line: string; //   hairline grid
  card: string; //   the card behind the canvas — point rings and doughnut gaps
  tooltipBg: string;
  tooltipInk: string;
  // Categorical palette for the sales-mix doughnut, and for one-line-per-shop
  // comparisons. Deliberately avoids the semantic green/red so a design's slice
  // never reads as "money in/out"; a calm pine → teal → amber → blue → olive run,
  // with muted clay for "Other".
  mix: readonly string[];
  mixOther: string;
}

export const PALETTES: Record<'light' | 'dark', ChartPalette> = {
  light: {
    green: '#1f7a4d',
    red: '#a8342a',
    blue: '#1d4e7a',
    amber: '#c08428',
    ink: '#23201c',
    muted: '#6b655c',
    line: 'rgba(35, 32, 28, 0.12)',
    card: '#ffffff',
    tooltipBg: '#23201c',
    tooltipInk: '#f7f4ee',
    mix: ['#1f5c4d', '#2d8f6b', '#3f9c93', '#c08428', '#1d4e7a', '#6b8f3a'],
    mixOther: '#96907f',
  },
  // Lifted to carry on a near-black card: the light values sit at 2–3:1 there,
  // which is the same readability problem the CSS palette fixes.
  dark: {
    green: '#55c08a',
    red: '#f0776a',
    blue: '#7ab0e0',
    amber: '#e0a94a',
    ink: '#ece7db',
    muted: '#a9a294',
    line: 'rgba(236, 231, 219, 0.14)',
    card: '#2b2721',
    tooltipBg: '#12100b',
    tooltipInk: '#ece7db',
    mix: ['#4aa789', '#5fc39b', '#5cc0bb', '#e0a94a', '#7ab0e0', '#9dc25c'],
    mixOther: '#8b8478',
  },
};

/** Axis-friendly short money: 176000 → "176k", 1_200_000 → "1.2m". */
export function compactMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
  }
  if (abs >= 1000) {
    return Math.round(n / 1000) + 'k';
  }
  return String(n);
}

/** An ISO date as a short axis tick — "Aug 12" — in the reader's own locale. */
export function shortDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
