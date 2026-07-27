/**
 * A deliberately small Markdown→HTML converter, scoped to exactly the subset
 * our policy documents use: headings (# … ######), **bold**, `-`/`*` bullet
 * lists, `---` rules, and paragraphs. It is NOT a general CommonMark parser —
 * the input is our own controlled docs under docs/policies, rendered read-only.
 *
 * Consecutive non-blank plain lines join with <br> (not a space): the policy
 * files put the "Effective Date / Last Updated" and "Email / Phone / Address"
 * blocks on adjacent lines and mean them as separate lines. No paragraph in
 * those docs wraps across physical lines, so this is faithful to the source.
 *
 * Output is limited to tags Angular's default sanitizer keeps, so it binds
 * safely via [innerHTML] with no bypass. Everything is HTML-escaped first.
 */
export function mdToHtml(md: string): string {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string): string =>
    esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = (): void => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
      para = [];
    }
  };
  const flushList = (): void => {
    if (list.length) {
      out.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`);
      list = [];
    }
  };

  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const t = raw.trim();
    if (t === '') {
      flushPara();
      flushList();
      continue;
    }
    if (t === '---') {
      flushPara();
      flushList();
      out.push('<hr>');
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(t);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(t);
    if (bullet) {
      flushPara();
      list.push(bullet[1]);
      continue;
    }
    flushList();
    para.push(t);
  }
  flushPara();
  flushList();
  return out.join('\n');
}
