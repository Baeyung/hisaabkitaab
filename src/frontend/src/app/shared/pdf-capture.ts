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
 * Oversampling over CSS pixels. At a normal window width this lands around 250dpi on A4 —
 * sharp enough for the 11px table type the print stylesheet sets, and half the pixels of
 * the obvious `2`, which matters because those pixels are what gets uploaded.
 */
const SCALE = 1.5;

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
    // One frame for the promoted rules to reflow the page before it gets measured.
    await new Promise(requestAnimationFrame);
    const canvas = await html2canvas(document.body, { scale: SCALE, backgroundColor: '#fff' });
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
    page.getContext('2d')?.drawImage(canvas, 0, -top);

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
