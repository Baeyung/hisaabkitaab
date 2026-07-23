import { anchorPopup } from './anchor-popup';

/** Stand-in for the popup element — only its box size is read. */
const popup = (width: number, height: number) =>
  ({ offsetWidth: width, offsetHeight: height }) as HTMLElement;

const rect = (left: number, top: number, width = 170, height = 42) =>
  ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;

describe('anchorPopup', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  });

  it('hangs below the trigger when there is room', () => {
    expect(anchorPopup(rect(100, 100), popup(280, 330))).toEqual({ top: 146, left: 100 });
  });

  it('flips above the trigger when the popup would run off the bottom', () => {
    // Trigger low on the page: 600 + 42 + 4 + 330 > 800.
    expect(anchorPopup(rect(100, 600), popup(280, 330))).toEqual({ top: 266, left: 100 });
  });

  it('clamps horizontally so a popup wider than its trigger stays on screen', () => {
    expect(anchorPopup(rect(900, 100), popup(280, 330)).left).toBe(712);
  });

  it('uses the raw anchor before the popup exists', () => {
    expect(anchorPopup(rect(100, 600), null)).toEqual({ top: 646, left: 100 });
  });
});
