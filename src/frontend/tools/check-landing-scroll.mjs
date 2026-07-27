/**
 * Asserts the /info landing hero still scrubs with the scroll.
 *
 * Usage: node tools/check-landing-scroll.mjs [url]   (default localhost:4200/info)
 *
 * This can't be an ng test: that runner has no layout engine, so offsetHeight is
 * always 0 and the whole thing under test — a playhead derived from the desk's
 * measured height — reads as zero. So it drives real Chrome over CDP instead.
 *
 * Worth keeping because the hero has already broken here once: it used to run on
 * CSS scroll timelines (animation-timeline/view()), which only Chromium ships, so
 * the book opened on a desktop Chrome and stayed shut on every phone. The motion
 * is plain calc() off --p now; this proves --p still moves and still drives it.
 *
 * Set CHROME to override the browser path.
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] ?? 'http://localhost:4200/info';

// Fresh profile: the page persists the chosen locale, so a reused one would start
// the next run in Urdu and invert the RTL check below. Port 0 lets Chrome pick a
// free one and write it into the profile — a fixed port would silently attach to
// a leftover browser from an earlier run, which is the same staleness by another
// door. Whatever happens, don't leave that browser running.
const profile = mkdtempSync(join(tmpdir(), 'hk-landing-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=0',
  '--no-first-run',
  `--user-data-dir=${profile}`,
  '--window-size=1200,900',
  'about:blank',
]);
process.on('exit', () => chrome.kill('SIGKILL'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
  }
  throw new Error('chrome never came up');
}

const ws = new WebSocket(await target());
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (pending.has(msg.id)) pending.get(msg.id)(msg);
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(4000);

// scroll to a fraction of the stage's scrub range, then read what CSS resolved to
const probe = (frac) =>
  evaluate(`(async () => {
    const host = document.querySelector('app-info');
    const stage = host.querySelector('.stage');
    const pin = host.querySelector('.stage__pin');
    window.scrollTo(0, (stage.offsetHeight - pin.offsetHeight) * ${frac});
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cs = getComputedStyle(host.querySelector('.book__cover'));
    return {
      p: +getComputedStyle(host).getPropertyValue('--p'),
      cover: cs.transform,
      phone: +getComputedStyle(host.querySelector('.phone')).opacity,
      navFg: getComputedStyle(host.querySelector('.topnav')).color,
      pinTop: pin.getBoundingClientRect().top,
    };
  })()`);

const closed = await probe(0);
const mid = await probe(0.35);
const open = await probe(0.62);
const end = await probe(1);
console.log({ closed, mid, open, end });

// --p must actually track scroll
assert.equal(closed.p, 0, '--p should start at 0');
assert.ok(Math.abs(mid.p - 0.35) < 0.02, `--p should track scroll, got ${mid.p}`);
assert.equal(end.p, 1, '--p should saturate at 1');

// the cover must be a real, changing 3D rotation — not stuck at identity
assert.ok(closed.cover === 'none' || closed.cover.startsWith('matrix(1, 0, 0, 1'), `cover should start closed, got ${closed.cover}`);
assert.ok(mid.cover.startsWith('matrix3d'), `cover should be mid-swing, got ${mid.cover}`);
assert.notEqual(mid.cover, open.cover, 'cover must keep moving between 35% and 62%');

// the phone rises only after the cover is clear
assert.equal(mid.phone, 0, 'phone hidden while the cover is still swinging');
assert.ok(end.phone === 1, `phone fully risen at the end, got ${end.phone}`);

// the desk stays pinned the whole way through
for (const [name, s] of Object.entries({ closed, mid, open, end }))
  assert.ok(Math.abs(s.pinTop) < 2, `pin should stay stuck at top during ${name}, got ${s.pinTop}`);

// The rail inverts later than the book scrub: it tracks the desk's bottom edge
// passing under it, which happens a full pinned screen after --p saturates.
const navAt = (offsetFromDeskBottom) =>
  evaluate(`(async () => {
    const host = document.querySelector('app-info');
    const stage = host.querySelector('.stage');
    window.scrollTo(0, stage.offsetHeight - ${offsetFromDeskBottom});
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      navp: +getComputedStyle(host).getPropertyValue('--navp'),
      fg: getComputedStyle(host.querySelector('.topnav')).color,
    };
  })()`);

const navCream = await navAt(400);
const navInk = await navAt(64);
console.log({ navCream, navInk });
assert.equal(navCream.navp, 0, 'rail still cream while the desk fills the screen');
assert.equal(navInk.navp, 1, `rail fully inverted as the desk clears, got ${navInk.navp}`);
assert.notEqual(navCream.fg, navInk.fg, 'rail colour must actually change');

// An Urdu khaata is bound on the right: same scrub, mirrored hinge and swing.
const rtl = await evaluate(`(async () => {
  const host = document.querySelector('app-info');
  host.querySelector('.topnav__lang').click();
  await new Promise(r => setTimeout(r, 60));
  const stage = host.querySelector('.stage'), pin = host.querySelector('.stage__pin');
  window.scrollTo(0, (stage.offsetHeight - pin.offsetHeight) * 0.35);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const cs = getComputedStyle(host.querySelector('.book__cover'));
  return { dir: host.getAttribute('dir'), origin: cs.transformOrigin, cover: cs.transform };
})()`);
console.log({ rtl });
assert.equal(rtl.dir, 'rtl', 'language toggle should flip the page to Urdu');
assert.match(rtl.origin, /^36\d(\.\d+)?px/, `RTL cover should hinge on the right edge, got ${rtl.origin}`);
// mirrored swing: the m13 term of the rotateY matrix flips sign against LTR
const m13 = (t) => +t.slice(9, -1).split(', ')[2];
assert.ok(m13(rtl.cover) * m13(mid.cover) < 0, 'RTL cover must swing the opposite way');

console.log('\nOK — book scrubs, phone rises, pin holds, rail inverts, RTL mirrors.');
process.exit(0); // the exit hook takes the browser down with it
