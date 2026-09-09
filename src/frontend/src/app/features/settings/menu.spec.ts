import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { SettingsMenu } from './menu';
import { StoreService } from '../../core/store/store.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { ToastService } from '../../shared/toast/toast.service';
import { Store, StoreSettings } from '../../core/store/store.models';

/**
 * The arranging screen holds the menu flat and saves it as a tree, so the whole of it turns
 * on one question: after this gesture, what is each row standing inside of? These check the
 * four gestures that can answer it wrongly — a drop, a step out, a step in, and pulling a
 * heading out from over a run — plus the two rules that outlive any of them: nothing may
 * stand deeper than the surface draws, and nothing may cut a group in half.
 */

function setup(saved?: Partial<StoreSettings>) {
  const written: StoreSettings[] = [];
  const fakeStores = {
    current: signal<Store | null>({
      id: 'shop-1',
      name: 'Ahmad Cloth House',
      settings: { easyMode: false, ...saved },
    } as Store),
    all: signal([]),
    isOwner: signal(true),
    updateSettings: (settings: StoreSettings) => {
      written.push(settings);
      return Promise.resolve();
    },
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: StoreService, useValue: fakeStores },
      // Nothing is rendered here, and the real one reads localStorage on construction.
      {
        provide: LocaleService,
        useValue: {
          t: (key: string) => key,
          dir: () => 'ltr',
          navLabel: (item: { key: string; label?: string }) => item.label || item.key,
        },
      },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
      { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
    ],
  });

  const page = TestBed.runInInjectionContext(() => new SettingsMenu());
  return { page, written };
}

/** The list as `key@depth`, which is the whole of what these tests are about. */
function shape(page: SettingsMenu): string[] {
  return page['rows']().map((row) => `${row.item.key}@${row.depth}`);
}

function indexOf(page: SettingsMenu, key: string): number {
  return page['rows']().findIndex((row) => row.item.key === key);
}

/** A drop, as the CDK reports one: an index in the list with the dragged row taken out. */
function drop(page: SettingsMenu, key: string, currentIndex: number): void {
  page['drop']({ previousIndex: indexOf(page, key), currentIndex } as CdkDragDrop<unknown>);
}

describe('SettingsMenu arranging', () => {
  it('ships the menu flat, one row per entry, groups over what they hold', () => {
    const { page } = setup();
    expect(shape(page).slice(0, 4)).toEqual([
      'nav.dashboard@1',
      'nav.newEntry@1',
      'nav.sale@2',
      'nav.receipt@2',
    ]);
  });

  it('puts a dropped row inside whatever heading it lands under', () => {
    const { page } = setup();
    // Dashboard, off the top, dropped in among Entry's children.
    drop(page, 'nav.dashboard', 2);
    const rows = page['rows']();
    expect(rows[indexOf(page, 'nav.dashboard')].depth).toBe(2);
    expect(shape(page).slice(0, 3)).toEqual(['nav.newEntry@1', 'nav.sale@2', 'nav.dashboard@2']);
  });

  it('takes a row out of its group and lands it past the group, not through it', () => {
    const { page } = setup();
    page['outdent'](indexOf(page, 'nav.sale'));

    const rows = shape(page);
    // Out at the top level, and the group it left is still whole behind it.
    expect(rows.slice(0, 9)).toEqual([
      'nav.dashboard@1',
      'nav.newEntry@1',
      'nav.receipt@2',
      'nav.purchase@2',
      'nav.processing@2',
      'nav.expense@2',
      'nav.payment@2',
      'nav.sale@1',
      'nav.reports@1',
    ]);
  });

  it('steps a row back into the group above it', () => {
    const { page } = setup();
    const sale = indexOf(page, 'nav.sale');
    page['outdent'](sale);

    const out = indexOf(page, 'nav.sale');
    expect(page['canIndent'](out)).toBe(true);
    page['indent'](out);

    expect(shape(page).slice(1, 8)).toEqual([
      'nav.newEntry@1',
      'nav.receipt@2',
      'nav.purchase@2',
      'nav.processing@2',
      'nav.expense@2',
      'nav.payment@2',
      'nav.sale@2',
    ]);
  });

  it('offers no step out at the top level and no step in without a group above', () => {
    const { page } = setup();
    expect(page['canOutdent'](indexOf(page, 'nav.dashboard'))).toBe(false);
    // Dashboard ships first, so there is no heading above it to step into.
    expect(page['canIndent'](indexOf(page, 'nav.dashboard'))).toBe(false);
    expect(page['canOutdent'](indexOf(page, 'nav.sale'))).toBe(true);
  });

  it('will not bury a group inside another one where the sidebar draws two levels', () => {
    const { page } = setup();
    // Reports, dragged into the middle of Entry's children. There is no room for it there,
    // so it closes the group instead of nesting inside it.
    drop(page, 'nav.reports', 3);

    const rows = page['rows']();
    const reports = indexOf(page, 'nav.reports');
    expect(rows[reports].depth).toBe(1);
    // And it still holds its own four, one level down.
    expect(rows.slice(reports + 1, reports + 5).map((row) => row.depth)).toEqual([2, 2, 2, 2]);
  });

  it('keeps what a removed group held, one level up and in order', () => {
    const { page } = setup();
    page['removeGroup'](indexOf(page, 'nav.stock'));

    expect(shape(page)).not.toContain('nav.stock@1');
    expect(shape(page)).toContain('nav.inventory@1');
    expect(shape(page)).toContain('nav.processedGoods@1');
  });

  it('saves the flat list back as the tree the sidebar reads', async () => {
    const { page, written } = setup();
    page['outdent'](indexOf(page, 'nav.sale'));
    await page.save();

    const menu = written[0].menu ?? [];
    const entry = menu.find((row) => row.key === 'nav.newEntry');
    expect(entry?.children?.map((child) => child.key)).toEqual([
      'nav.receipt',
      'nav.purchase',
      'nav.processing',
      'nav.expense',
      'nav.payment',
    ]);
    // Sale came out of the group, so it is a top-level entry sitting after it.
    expect(menu.map((row) => row.key)).toContain('nav.sale');
  });

  it('lets the board nest one level deeper than the sidebar', () => {
    const { page } = setup({ easyMode: true });
    expect(page['maxDepth']).toBe(3);
    // A tab, its bands, and their buttons — three levels, which the sidebar refuses.
    expect(page['rows']().some((row) => row.depth === 3)).toBe(true);
  });

  it('never lets a locked screen be hidden, nor the group standing over it', () => {
    const { page } = setup();
    expect(page['locksMenu'](indexOf(page, 'nav.settings.menu'))).toBe(true);
    expect(page['locksMenu'](indexOf(page, 'nav.settings'))).toBe(true);
    expect(page['locksMenu'](indexOf(page, 'nav.dashboard'))).toBe(false);
  });
});
