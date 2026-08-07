/**
 * The current screen as a self-contained HTML page, for the renderer to print.
 *
 * Nothing here decides what the printout looks like — the page already carries that in its
 * `@media print` rules, and the renderer prints under print media, so the letterhead
 * appears, the app chrome drops away and `@page` supplies the margins exactly as they do
 * when the shopkeeper presses Print. That is the point of shipping the page rather than a
 * picture of it: one stylesheet, one printout, and text that stays sharp at any zoom.
 *
 * "Self-contained" is the only real work. The renderer opens this HTML with no base URL, so
 * every stylesheet is inlined from the CSSOM and every script is dropped.
 */
export function printableHtml(): string {
  const page = document.documentElement.cloneNode(true) as HTMLElement;

  // Scripts would re-bootstrap the app into a page that has no server to talk to; the
  // original <style>/<link> elements are replaced wholesale by the collected CSS below.
  page.querySelectorAll('script, style, link[rel="stylesheet"]').forEach((el) => el.remove());
  carryFieldValues(page);

  const style = document.createElement('style');
  style.textContent = collectCss();
  page.querySelector('head')?.appendChild(style);

  return `<!doctype html>${page.outerHTML}`;
}

/**
 * Every rule the page is currently styled by, as text.
 *
 * Cross-origin sheets — the webfonts — refuse to hand over their rules, so they are re-cited
 * as `@import` and the renderer fetches them itself. Those imports have to lead: a stylesheet
 * ignores an `@import` that appears after a rule, and losing them costs Urdu its Nastaliq.
 */
function collectCss(): string {
  const imports: string[] = [];
  const rules: string[] = [];

  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) {
    try {
      rules.push([...sheet.cssRules].map((rule) => rule.cssText).join('\n'));
    } catch {
      const href = (sheet as CSSStyleSheet).href;
      if (href) {
        imports.push(`@import url("${href}");`);
      }
    }
  }

  return [...imports, ...rules].join('\n');
}

/**
 * Copy what has been typed into the attributes that serialise.
 *
 * A cloned `<input>` carries the value it was built with, not the one the shopkeeper typed
 * — so without this the sale screen prints a bill with an empty party and no amounts.
 */
function carryFieldValues(page: HTMLElement): void {
  const live = document.querySelectorAll('input, textarea, select');

  page.querySelectorAll('input, textarea, select').forEach((clone, i) => {
    const source = live[i];
    if (source instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
      clone.setAttribute('value', source.value);
      if (source.checked) {
        clone.setAttribute('checked', '');
      }
      return;
    }
    if (source instanceof HTMLTextAreaElement && clone instanceof HTMLTextAreaElement) {
      clone.textContent = source.value;
      return;
    }
    if (source instanceof HTMLSelectElement && clone instanceof HTMLSelectElement) {
      clone.options[source.selectedIndex]?.setAttribute('selected', '');
    }
  });
}
