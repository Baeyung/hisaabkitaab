import { MenuSetting } from '../../core/store/store.models';
import { NAV, NavGroup, NavItem, mergeMenu, navFor, visible } from './nav';

/** Top-level keys, in order — what most of these assertions are really about. */
const keys = (items: readonly NavItem[]) => items.map((item) => item.key);

const groupIn = (items: readonly NavItem[], key: string) =>
  items.find((item): item is NavGroup => item.key === key && item.kind === 'group');

const at = (key: string, extra: Partial<MenuSetting> = {}): MenuSetting => ({ key, ...extra });

/**
 * A shop's own arrangement of the menu, reconciled against the menu this build actually
 * has. The reconciling is the whole point: a stored arrangement is a list of keys written
 * at some past version, so it will eventually be missing an item and holding one that is
 * gone, and neither may break a shopkeeper's sidebar.
 */
describe('mergeMenu', () => {
  it('puts the menu in the order the shop asked for', () => {
    const merged = mergeMenu(NAV, [at('nav.ledger'), at('nav.cashbook')]);

    expect(keys(merged).slice(0, 2)).toEqual(['nav.ledger', 'nav.cashbook']);
  });

  it('appends items the saved arrangement predates instead of losing them', () => {
    // An arrangement written when the app had two screens. Everything shipped since has
    // to turn up — at the end, where it can be seen and moved.
    const merged = mergeMenu(NAV, [at('nav.ledger'), at('nav.cashbook')]);

    expect(keys(merged).length).toBe(NAV.length);
    for (const item of NAV) {
      expect(keys(merged)).toContain(item.key);
    }
  });

  it('drops keys for screens that no longer exist', () => {
    const merged = mergeMenu(NAV, [at('nav.retiredScreen'), at('nav.ledger')]);

    expect(keys(merged)).not.toContain('nav.retiredScreen');
    expect(keys(merged)[0]).toBe('nav.ledger');
  });

  it('takes a duplicated key once', () => {
    const merged = mergeMenu(NAV, [at('nav.ledger'), at('nav.ledger')]);

    expect(keys(merged).filter((key) => key === 'nav.ledger').length).toBe(1);
    expect(keys(merged).length).toBe(NAV.length);
  });

  it('marks hidden items rather than removing them, so they can be brought back', () => {
    const merged = mergeMenu(NAV, [at('nav.inventory', { hidden: true })]);

    expect(keys(merged)).toContain('nav.inventory');
    expect(merged.find((item) => item.key === 'nav.inventory')?.hidden).toBe(true);
  });

  it('refuses to hide the settings group or the screen that does the arranging', () => {
    // The lockout guard: hiding either of these is how an owner would strand themselves
    // with a menu they can no longer change from inside the app.
    const merged = mergeMenu(NAV, [
      at('nav.settings', {
        hidden: true,
        children: [at('nav.settings.menu', { hidden: true })],
      }),
    ]);

    const settings = groupIn(merged, 'nav.settings');
    expect(settings?.hidden).toBe(false);
    expect(settings?.children.find((c) => c.key === 'nav.settings.menu')?.hidden).toBe(false);
  });

  it('reorders and renames inside a group', () => {
    const merged = mergeMenu(NAV, [
      at('nav.newEntry', {
        children: [at('nav.payment'), at('nav.sale', { label: 'Bikri' })],
      }),
    ]);

    const entry = groupIn(merged, 'nav.newEntry');
    expect(entry?.children.map((c) => c.key).slice(0, 2)).toEqual(['nav.payment', 'nav.sale']);
    expect(entry?.children.find((c) => c.key === 'nav.sale')?.label).toBe('Bikri');
    // Untouched siblings are still there, after the two that were named.
    expect(entry?.children.length).toBe(
      (NAV.find((i) => i.key === 'nav.newEntry') as NavGroup).children.length,
    );
  });

  it('treats a blank or whitespace label as no label at all', () => {
    const merged = mergeMenu(NAV, [at('nav.ledger', { label: '   ' })]);

    expect(merged.find((item) => item.key === 'nav.ledger')?.label).toBeUndefined();
  });

  it('cannot hand a role a screen it is not entitled to', () => {
    // The arrangement runs *after* navFor, never instead of it. A stored document naming
    // an editors-only group must not put it back into a viewer's menu.
    const merged = mergeMenu(navFor('VIEWER'), [at('nav.newEntry'), at('nav.settings.items')]);

    expect(keys(merged)).not.toContain('nav.newEntry');
    expect(groupIn(merged, 'nav.settings')?.children.map((c) => c.key)).not.toContain(
      'nav.settings.items',
    );
  });
});

/** What the sidebar draws once the arrangement has been applied. */
describe('visible', () => {
  it('leaves out what the shop hid', () => {
    const shown = visible(mergeMenu(NAV, [at('nav.inventory', { hidden: true })]));

    expect(keys(shown)).not.toContain('nav.inventory');
    expect(keys(shown).length).toBe(NAV.length - 1);
  });

  it('drops a group whose children are all hidden', () => {
    const entry = NAV.find((item) => item.key === 'nav.newEntry') as NavGroup;
    const shown = visible(
      mergeMenu(NAV, [
        at('nav.newEntry', {
          children: entry.children.map((child) => at(child.key, { hidden: true })),
        }),
      ]),
    );

    expect(keys(shown)).not.toContain('nav.newEntry');
  });

  it('keeps a group that still has one child', () => {
    const entry = NAV.find((item) => item.key === 'nav.newEntry') as NavGroup;
    const shown = visible(
      mergeMenu(NAV, [
        at('nav.newEntry', {
          children: entry.children.map((child, i) => at(child.key, { hidden: i > 0 })),
        }),
      ]),
    );

    expect(groupIn(shown, 'nav.newEntry')?.children.length).toBe(1);
  });

  it('is the identity on a shop that has never arranged anything', () => {
    expect(keys(visible(mergeMenu(NAV, [])))).toEqual(keys(NAV));
    expect(keys(visible(mergeMenu(NAV)))).toEqual(keys(NAV));
  });
});
