import { MenuSetting } from '../../core/store/store.models';
import { NAV, NavGroup, NavItem, height, isCustomGroup, mergeMenu, navFor, visible } from './nav';

/** Top-level keys, in order — what most of these assertions are really about. */
const keys = (items: readonly NavItem[]) => items.map((item) => item.key);

const groupIn = (items: readonly NavItem[], key: string) =>
  items.find((item): item is NavGroup => item.key === key && item.kind === 'group');

const at = (key: string, extra: Partial<MenuSetting> = {}): MenuSetting => ({ key, ...extra });

/** Whether every row in a menu stands within a surface that draws `max` levels. */
const fits = (items: readonly NavItem[], depth: number, max: number): boolean =>
  items.every(
    (item) =>
      depth + height(item) <= max && (item.kind === 'link' || fits(item.children, depth + 1, max)),
  );

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

  it('puts an entry wherever the document put it, group or no group', () => {
    // The whole of custom grouping in one assertion: Sale ships inside New Entry, and a shop
    // that wants it on the top level beside Ledger gets it there.
    const merged = mergeMenu(NAV, [at('nav.sale'), at('nav.ledger')]);

    expect(keys(merged).slice(0, 2)).toEqual(['nav.sale', 'nav.ledger']);
    expect(groupIn(merged, 'nav.newEntry')?.children.map((c) => c.key)).not.toContain('nav.sale');
  });

  it('builds a group a shop made for itself out of screens that ship apart', () => {
    const merged = mergeMenu(NAV, [
      at('grp:counter', {
        label: 'Counter',
        children: [at('nav.sale'), at('nav.billManagement')],
      }),
    ]);

    const counter = groupIn(merged, 'grp:counter');
    expect(counter?.label).toBe('Counter');
    expect(counter?.children.map((c) => c.key)).toEqual(['nav.sale', 'nav.billManagement']);
    // Borrowed from the first entry in it, since a group a shop made has no mark of its own.
    expect(counter?.icon).toBe('sale');
    // And neither screen is left behind where it ships.
    expect(keys(merged)).not.toContain('nav.billManagement');
    expect(groupIn(merged, 'nav.newEntry')?.children.map((c) => c.key)).not.toContain('nav.sale');
  });

  it('dissolves a group a shop never named, keeping what was in it', () => {
    // It has no name in either language, so there is no heading to draw — but the two screens
    // someone put together are not the thing to throw away.
    const merged = mergeMenu(NAV, [
      at('grp:blank', { children: [at('nav.sale'), at('nav.payment')] }),
    ]);

    expect(keys(merged).some(isCustomGroup)).toBe(false);
    expect(keys(merged).slice(0, 2)).toEqual(['nav.sale', 'nav.payment']);
  });

  it('empties a built-in group rather than duplicating what was dragged out of it', () => {
    const merged = mergeMenu(NAV, [
      at('nav.newEntry', { children: [] }),
      ...(NAV.find((i) => i.key === 'nav.newEntry') as NavGroup).children.map((c) => at(c.key)),
    ]);

    expect(groupIn(merged, 'nav.newEntry')?.children.length).toBe(0);
    // Gone from the sidebar, but every screen that was in it is one click nearer, not lost.
    expect(keys(visible(merged))).not.toContain('nav.newEntry');
    expect(keys(merged)).toContain('nav.sale');
  });

  it('refuses to hide a group holding a screen that may not be hidden', () => {
    // The way round the lock, if it worked: drag Menu into a group of your own, then switch
    // the group off. The lock is on what the group holds, not on which group it is.
    const merged = mergeMenu(NAV, [
      at('grp:mine', {
        label: 'Mine',
        hidden: true,
        children: [at('nav.settings.menu')],
      }),
    ]);

    expect(groupIn(merged, 'grp:mine')?.hidden).toBe(false);
    expect(keys(visible(merged))).toContain('grp:mine');
  });

  it('hides a group a shop made when nothing in it is locked', () => {
    const merged = mergeMenu(NAV, [
      at('grp:mine', { label: 'Mine', hidden: true, children: [at('nav.sale')] }),
    ]);

    expect(groupIn(merged, 'grp:mine')?.hidden).toBe(true);
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

  it('cannot smuggle a screen in through a group a shop made', () => {
    // A hand-edited document naming an editors-only screen inside a shop's own group is still
    // read after navFor, so there is nothing there to place.
    const merged = mergeMenu(navFor('VIEWER'), [
      at('grp:mine', { label: 'Mine', children: [at('nav.sale'), at('nav.settings.items')] }),
    ]);

    // The group survives as a heading over nothing, which is exactly what `visible` drops.
    expect(groupIn(merged, 'grp:mine')?.children).toEqual([]);
    expect(keys(visible(merged))).not.toContain('grp:mine');
  });

  it('is the identity on a shop that has never arranged anything', () => {
    expect(keys(visible(mergeMenu(NAV, [])))).toEqual(keys(NAV));
    expect(keys(visible(mergeMenu(NAV)))).toEqual(keys(NAV));
  });
});

/**
 * How deep the surface being drawn actually goes: two levels for the sidebar, three for the
 * board. One number rather than two code paths, so everything above holds at either depth —
 * and so a document written for one surface cannot draw a heading the other has no room for.
 */
describe('mergeMenu depth', () => {
  it('keeps a group inside a group when the surface has room for it', () => {
    const merged = mergeMenu(
      NAV,
      [
        at('grp:tab', {
          label: 'Counter',
          children: [at('grp:band', { label: 'Takings', children: [at('nav.sale')] })],
        }),
      ],
      3,
    );

    const band = groupIn(groupIn(merged, 'grp:tab')?.children ?? [], 'grp:band');
    expect(keys(band?.children ?? [])).toEqual(['nav.sale']);
  });

  it('dissolves a group standing deeper than the surface draws, keeping what is in it', () => {
    // The sidebar's own depth. A document written for the board and then read by the sidebar
    // is exactly this, and it must come back as a menu rather than as a heading it cannot draw.
    const merged = mergeMenu(NAV, [
      at('grp:tab', {
        label: 'Counter',
        children: [at('grp:band', { label: 'Takings', children: [at('nav.sale')] })],
      }),
    ]);

    expect(keys(merged)).not.toContain('grp:band');
    expect(keys(groupIn(merged, 'grp:tab')?.children ?? [])).toEqual(['nav.sale']);
  });

  it("carries a band's colour through, and only a colour this build knows", () => {
    const merged = mergeMenu(
      NAV,
      [
        at('grp:in', { label: 'In', tone: 'in', children: [at('nav.sale')] }),
        at('grp:odd', { label: 'Odd', tone: 'chartreuse' as never, children: [at('nav.receipt')] }),
      ],
      3,
    );

    expect(groupIn(merged, 'grp:in')?.tone).toBe('in');
    expect(groupIn(merged, 'grp:odd')?.tone).toBeUndefined();
  });

  it('does not draw a second copy of a group the document dissolved', () => {
    // A built-in group buried too deep is dissolved, which leaves its key claimed but no
    // heading emitted. Putting it back where it ships would be a heading standing over
    // nothing beside the entries that were in it.
    const merged = mergeMenu(NAV, [
      at('nav.settings', {
        children: [at('nav.newEntry', { children: [at('nav.sale')] })],
      }),
    ]);

    expect(keys(merged).filter((key) => key === 'nav.newEntry')).toEqual([]);
    expect(keys(groupIn(merged, 'nav.settings')?.children ?? [])).toContain('nav.sale');
    // And nothing that shipped in it is lost on the way.
    const everywhere = (items: readonly NavItem[]): string[] =>
      items.flatMap((item) => [
        item.key,
        ...(item.kind === 'group' ? everywhere(item.children) : []),
      ]);
    expect(everywhere(merged)).toContain('nav.receipt');
  });

  it('keeps the lock through a second level of nesting', () => {
    // Menu is the screen that undoes all of this, so a heading holding it cannot be switched
    // off — however deep the heading was buried before the switch was thrown.
    const merged = mergeMenu(
      NAV,
      [
        at('grp:tab', {
          label: 'Counter',
          hidden: true,
          children: [
            at('grp:band', {
              label: 'Setup',
              hidden: true,
              children: [at('nav.settings.menu', { hidden: true })],
            }),
          ],
        }),
      ],
      3,
    );

    const tab = groupIn(merged, 'grp:tab');
    const band = groupIn(tab?.children ?? [], 'grp:band');
    expect(tab?.hidden).toBe(false);
    expect(band?.hidden).toBe(false);
    expect(band?.children[0].hidden).toBe(false);
  });
});

/**
 * What a move is measured against. A group is never one row being placed — it is everything
 * under it being placed with it, and getting that wrong is how a board tab ends up inside
 * another tab with its bands one level past what the board draws, to be dissolved on the way
 * back in.
 */
describe('height', () => {
  it('measures an entry as the one level it takes', () => {
    expect(height({ kind: 'link', key: 'nav.ledger', path: 'ledger', icon: 'ledger' })).toBe(1);
  });

  it('measures a group of entries as two, and a group of those as three', () => {
    const band: NavGroup = {
      kind: 'group',
      key: 'grp:band',
      icon: 'menu',
      children: [{ kind: 'link', key: 'nav.sale', path: 'new-entry/sale', icon: 'sale' }],
    };
    const tab: NavGroup = { kind: 'group', key: 'grp:tab', icon: 'menu', children: [band] };

    expect(height(band)).toBe(2);
    expect(height(tab)).toBe(3);
  });

  it('measures a group with nothing in it yet as two, not one', () => {
    // It is empty because it was made a moment ago. Measuring the one level it currently
    // occupies would let it be dropped somewhere with no room for the first entry put in it.
    expect(height({ kind: 'group', key: 'grp:new', icon: 'menu', children: [] })).toBe(2);
  });

  it('leaves the shipped sidebar standing within the depth that draws it', () => {
    // `depth` here is the list a row is sitting in, counted the way `depthOf` counts it: the
    // top level is 0, so a row there takes `height` levels and no more.
    expect(fits(mergeMenu(NAV, [], 2), 0, 2)).toBe(true);
  });
});
