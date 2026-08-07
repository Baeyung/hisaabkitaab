/*
 * Turns a printable page into a PDF, using the only text engine that gets Urdu right.
 *
 * The statement and the bill are laid out entirely in the frontend's print stylesheet, and
 * Noto Nastaliq needs full contextual shaping that no JS PDF library does — so rather than
 * rebuild either, this renders the page the shopkeeper is looking at in a real browser and
 * asks it to print. Chrome applies `@media print` and `@page` itself, so the PDF is the
 * printout, with selectable text that stays sharp at any zoom.
 */
const http = require('http');
const { chromium } = require('playwright');

const PORT = Number(process.env.PORT || 3000);

/** Chrome takes seconds to start, so it is launched once and kept for the process's life. */
let browser;
async function chrome() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  }
  return browser;
}

async function render(html) {
  const context = await (await chrome()).newContext();
  try {
    const page = await context.newPage();
    await page.emulateMedia({ media: 'print' });
    // The page carries its own webfonts by @import, so wait for the network to go quiet
    // rather than for load — otherwise Nastaliq falls back mid-render.
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      // Matches the `@page { margin: 12mm }` the print stylesheet asks for. Set here too so
      // the margin is the same whether or not that rule survives a future edit.
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
  } finally {
    // Per-render context: one statement's fonts and styles never leak into the next.
    await context.close();
  }
}

function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200).end('ok');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/render') {
    res.writeHead(404).end('not found');
    return;
  }

  try {
    const { html } = JSON.parse(await body(req));
    if (typeof html !== 'string' || html.length === 0) {
      res.writeHead(400).end('html required');
      return;
    }
    const pdf = await render(html);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length }).end(pdf);
  } catch (error) {
    console.error('render failed:', error);
    res.writeHead(500).end('render failed');
  }
});

server.listen(PORT, () => console.log(`pdf renderer listening on ${PORT}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    await browser?.close().catch(() => {});
    server.close(() => process.exit(0));
  });
}
