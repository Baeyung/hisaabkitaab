import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

/** What the shopkeeper picked. 'system' defers to the device. */
export type ThemePreference = 'system' | 'light' | 'dark';
/** What the app actually paints. Always one or the other. */
export type Theme = 'light' | 'dark';

const THEME_KEY = 'hk.theme';
const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** --kg-chrome per theme, mirrored for the theme-color meta tag. */
const CHROME: Record<Theme, string> = { light: '#23201c', dark: '#16130d' };

function storedPreference(): ThemePreference {
  const saved = localStorage.getItem(THEME_KEY);
  return PREFERENCES.includes(saved as ThemePreference) ? (saved as ThemePreference) : 'system';
}

/**
 * Owns the light/lamplight choice, mirroring LocaleService: a signal backed by
 * localStorage, written to <html> by an effect.
 *
 * The resolution of 'system' happens here rather than in a CSS
 * prefers-color-scheme query, so styles.css needs one `[data-theme='dark']`
 * rule instead of two copies of the palette (one for "device says dark", one
 * for "user pinned dark"). index.html stamps the same attribute before Angular
 * boots so a dark-theme user never sees a flash of cream.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly _preference = signal<ThemePreference>(storedPreference());

  /** Tracks the OS setting so 'system' follows a change made while the app is open. */
  private readonly systemDark = signal(
    this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false,
  );

  readonly preference = this._preference.asReadonly();
  readonly resolved = computed<Theme>(() => {
    const preference = this._preference();
    return preference === 'system' ? (this.systemDark() ? 'dark' : 'light') : preference;
  });

  readonly options = PREFERENCES;

  constructor() {
    const media = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');
    media?.addEventListener('change', (e) => this.systemDark.set(e.matches));

    effect(() => {
      const theme = this.resolved();
      this.document.documentElement.dataset['theme'] = theme;
      // Keep the mobile browser/status bar matched to the topbar it sits above.
      // Driven from here rather than a `media` attribute on two <meta> tags so it
      // tracks the pinned preference, not just the device setting.
      this.document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', CHROME[theme]);
    });
  }

  setPreference(preference: ThemePreference): void {
    localStorage.setItem(THEME_KEY, preference);
    this._preference.set(preference);
  }
}
