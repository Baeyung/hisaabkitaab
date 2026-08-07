/**
 * Renders the current screen to PDF bytes, laid out exactly as Print lays it out.
 *
 * The trick is that the printed page is not a separate template — it is this page with
 * `@media print` applied (chrome and controls gone, paper white, tables compacted, the
 * shop letterhead revealed). A screenshot renderer never sees those rules, so we lift
 * every print rule out of its media block and add it to the live document for the length
 * of the capture. Nothing is duplicated: whatever the print stylesheet grows to, and
 * whatever a component adds in its own `@media print`, the PDF picks up for free.
 *
 * ponytail: the promoted rules go on the live document, not on the renderer's cloned
 * copy — the clone is measured against the on-screen layout, where the app pins itself to
 * the viewport, and a long statement would be cut off at one page. The cost is that the
 * page visibly reflows to its printed form for the second or two the capture takes.
 * Render it off-screen in an iframe if that flash ever bothers anyone.
 *
 * The result is a raster of the page, sliced onto A4 pages — text is not selectable.
 * Swap in a text-native renderer if parties start needing to copy figures out.
 */

/** A4 at 72dpi, in the points jsPDF measures in. */
const PAGE = { width: 595.28, height: 841.89 };

/**
 * How wide the rendered page is, in pixels, across an A4 sheet — 1240px over 8.27in is
 * 150dpi, which prints text cleanly and reads sharp on a phone.
 *
 * Deliberately a target rather than a multiplier of CSS pixels: capture scale would
 * otherwise ride on the shopkeeper's window width, so the same statement would weigh
 * three times as much from a wide monitor as from a laptop. Deriving the scale from this
 * makes every send the same size, whatever it was sent from.
 */
const PAGE_WIDTH_PX = 1240;

/**
 * Anti-aliasing gives a page of black-on-white text a few thousand near-identical
 * colours, and near-identical is exactly what deflate cannot collapse. Snapping
 * near-white to paper white and everything else onto 16 levels per channel cuts the
 * finished PDF to about a third with no visible change — the value colours survive,
 * because 16 levels is far more than the handful of tints the ledger actually uses.
 */
const WHITE_AT = 246;
const LEVELS = 16;

export async function capturePrintablePdf(): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  const style = document.createElement('style');
  style.textContent = printCss();
  // Last in the head, so at equal specificity the print rules win the cascade.
  document.head.appendChild(style);

  // The Lamplight palette is declared inside @media screen precisely so that printing
  // inherits the light tokens instead. Promoting the print rules doesn't leave that
  // media block, so pin the theme by hand — otherwise a shopkeeper on a dark device
  // sends their customer cream text on white paper.
  const root = document.documentElement;
  const theme = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light');
  try {
    await settled();
    const canvas = await html2canvas(document.body, {
      scale: PAGE_WIDTH_PX / document.body.scrollWidth,
      backgroundColor: '#fff',
    });
    // compress: true is not optional. Without it jsPDF stores the page bitmap as raw RGB —
    // an ordinary statement came to 18MB, which the server rejected outright.
    return paginate(canvas, new jsPDF({ unit: 'pt', format: 'a4', compress: true }));
  } finally {
    style.remove();
    if (theme === null) {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }
}

/**
 * Hold until the page has stopped changing shape.
 *
 * The promoted rules are a big layout change — they reveal the letterhead and, on a
 * statement, every bill's item sub-rows, all of which are `display:none` on screen. Render
 * while that reflow is still in flight and html2canvas measures some elements at their old
 * positions and draws others at their new ones, which comes out as overlapping, re-wrapped
 * text: a statement that went out with "Bilal Traders" run together and its totals split
 * across lines. Waiting a fixed frame or two is a guess; waiting for the height to stop
 * moving is the actual condition, and it costs two frames when there was nothing to wait
 * for. Fonts first, since text that reflows on a late-arriving face moves everything under
 * it — the language toggle can still be fetching its face when Send is pressed.
 */
async function settled(): Promise<void> {
  await document.fonts.ready;

  let previous = -1;
  // Bounded: a page that somehow never settles still has to be sent.
  for (let frame = 0; frame < 12; frame++) {
    await new Promise(requestAnimationFrame);
    const height = document.body.scrollHeight;
    if (height === previous) {
      return;
    }
    previous = height;
  }
}

/** Every `@media print` rule in the document, unwrapped so it applies unconditionally. */
function printCss(): string {
  const sheets = [...document.styleSheets, ...document.adoptedStyleSheets];
  return sheets
    .map((sheet) => {
      try {
        return unwrap(sheet.cssRules);
      } catch {
        return ''; // cross-origin sheet — not ours, nothing to promote
      }
    })
    .join('\n');
}

function unwrap(rules: CSSRuleList): string {
  let css = '';
  for (const rule of rules) {
    if (rule instanceof CSSMediaRule) {
      if (rule.media.mediaText.includes('print')) {
        css += [...rule.cssRules].map((r) => r.cssText).join('\n') + '\n';
      }
    } else if (rule instanceof CSSSupportsRule || rule instanceof CSSLayerBlockRule) {
      // Groupings that only wrap rules. Style rules are skipped on purpose: CSS nesting
      // gives them a .cssRules too, and a nested rule's text means nothing on its own.
      css += unwrap(rule.cssRules);
    }
  }
  return css;
}

/** Slice the tall page image into A4 pages — one image per page, not one image repeated. */
function paginate(
  canvas: HTMLCanvasElement,
  pdf: InstanceType<typeof import('jspdf').jsPDF>,
): Blob {
  const pageHeightPx = Math.floor((canvas.width * PAGE.height) / PAGE.width);

  for (let top = 0; top < canvas.height; top += pageHeightPx) {
    const height = Math.min(pageHeightPx, canvas.height - top);
    const page = document.createElement('canvas');
    page.width = canvas.width;
    page.height = height;
    const ctx = page.getContext('2d');
    ctx?.drawImage(canvas, 0, -top);
    // Per page rather than over the whole tall canvas: a long khata's pixel buffer would
    // be hundreds of megabytes in one go, and one page's is a few.
    if (ctx) {
      flatten(ctx, page.width, page.height);
    }

    if (top > 0) {
      pdf.addPage();
    }
    pdf.addImage(
      page.toDataURL('image/png'),
      'PNG',
      0,
      0,
      PAGE.width,
      (height * PAGE.width) / canvas.width,
    );
  }

  return pdf.output('blob');
}

/**
 * Collapse anti-aliasing noise into a few repeated values so deflate has long runs to
 * work with. One linear pass over the page's pixels — about 10ms for an A4 page, which
 * is nothing next to the render that produced them.
 */
function flatten(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  const step = 255 / (LEVELS - 1);

  for (let i = 0; i < px.length; i += 4) {
    if (px[i] >= WHITE_AT && px[i + 1] >= WHITE_AT && px[i + 2] >= WHITE_AT) {
      px[i] = px[i + 1] = px[i + 2] = 255;
      continue;
    }
    px[i] = Math.round(px[i] / step) * step;
    px[i + 1] = Math.round(px[i + 1] / step) * step;
    px[i + 2] = Math.round(px[i + 2] / step) * step;
  }

  ctx.putImageData(image, 0, 0);
}
