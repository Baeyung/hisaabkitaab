import { mdToHtml } from './mini-md';

describe('mdToHtml', () => {
  it('renders headings at their level', () => {
    expect(mdToHtml('# Title')).toBe('<h1>Title</h1>');
    expect(mdToHtml('### 2.1 Sub')).toBe('<h3>2.1 Sub</h3>');
  });

  it('renders bold inside paragraphs and list items', () => {
    expect(mdToHtml('**Effective Date:** 27 July 2026')).toBe(
      '<p><strong>Effective Date:</strong> 27 July 2026</p>',
    );
    expect(mdToHtml('- **Account:** name')).toBe(
      '<ul><li><strong>Account:</strong> name</li></ul>',
    );
  });

  it('groups consecutive bullets into one list', () => {
    expect(mdToHtml('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('joins adjacent plain lines with <br>, splits on a blank line', () => {
    expect(mdToHtml('Email: a\nPhone: b')).toBe('<p>Email: a<br>Phone: b</p>');
    expect(mdToHtml('one\n\ntwo')).toBe('<p>one</p>\n<p>two</p>');
  });

  it('renders --- as a rule', () => {
    expect(mdToHtml('---')).toBe('<hr>');
  });

  it('escapes HTML so the source cannot inject markup', () => {
    expect(mdToHtml('a <b> & "as is"')).toBe('<p>a &lt;b&gt; &amp; "as is"</p>');
  });
});
