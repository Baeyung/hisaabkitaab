import { describe, expect, it } from 'vitest';
import { ChartPalette, PALETTES } from './dashboard';

/**
 * A canvas can't read a CSS custom property, so dashboard.ts keeps its own copy
 * of the palette — the one place in the app where the theme colours are
 * duplicated, and so the one place they can silently drift out of step.
 *
 * These assert what the duplication is for: chart text and value colours have to
 * stay readable on the card behind the canvas. The lamplight theme exists because
 * the paper values collapse there — payable red #a8342a is 2.4:1 on a dark card —
 * and nothing stops someone pasting the light hex into the dark palette. This
 * catches that.
 *
 * (The CSS tokens themselves aren't asserted here: `ng test` stubs stylesheet
 * imports, so a spec can't read styles.css. Their ratios are documented in the
 * token block instead.)
 */

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => srgbToLinear(parseInt(full.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* Two floors, by role. 4.5:1 is the WCAG AA minimum for text — legend labels
   and axis ticks are text, and green/red/blue also label their own series, so
   they are held to it. Amber only ever fills a bar (`color(days)` in the
   dead-stock chart), which puts it under 1.4.11 non-text contrast at 3:1. */
const AS_TEXT: ReadonlyArray<keyof ChartPalette> = ['ink', 'muted', 'green', 'red', 'blue'];
const AS_FILL: ReadonlyArray<keyof ChartPalette> = ['amber'];

describe.each(Object.entries(PALETTES))('%s chart palette', (theme, pal) => {
  it.each(AS_TEXT)('%s clears 4.5:1 on the card as text', (key) => {
    const ratio = contrast(pal[key] as string, pal.card);
    expect(ratio, `${theme}: ${key} on card is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(AS_FILL)('%s clears 3:1 on the card as a fill', (key) => {
    const ratio = contrast(pal[key] as string, pal.card);
    expect(ratio, `${theme}: ${key} on card is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });

  it('keeps tooltip text readable on the tooltip fill', () => {
    expect(contrast(pal.tooltipInk, pal.tooltipBg)).toBeGreaterThanOrEqual(4.5);
  });

  // Doughnut slices are filled shapes with a label in the legend, not text, so
  // 3:1 (the WCAG floor for non-text) is the bar — and adjacent slices have to
  // be told apart from each other, which the ring gap alone doesn't do.
  it('keeps every sales-mix slice distinguishable from the card', () => {
    for (const slice of [...pal.mix, pal.mixOther]) {
      expect(contrast(slice, pal.card), `${theme}: slice ${slice}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('defines a slice colour for every semantic key', () => {
    expect(pal.mix.length).toBeGreaterThanOrEqual(6);
    expect(new Set(pal.mix).size).toBe(pal.mix.length);
  });
});

describe('theme parity', () => {
  it('gives both themes the same keys, so neither can miss one', () => {
    expect(Object.keys(PALETTES.dark).sort()).toEqual(Object.keys(PALETTES.light).sort());
  });

  it('shares no surface colour between themes', () => {
    // A pasted-in light value is the failure mode; card and ink are the tells.
    expect(PALETTES.dark.card).not.toBe(PALETTES.light.card);
    expect(PALETTES.dark.ink).not.toBe(PALETTES.light.ink);
  });
});
