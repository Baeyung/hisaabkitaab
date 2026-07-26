import { Component, inject } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';

/**
 * Appearance control in the sidebar foot, beside the language toggle — both are
 * device preferences, so they live together rather than in Store Settings, which
 * holds shop data that is saved to the server.
 *
 * A three-way segmented radio group, not a light/dark switch: "follow my device"
 * is a distinct state from either fixed theme, and a two-position switch has
 * nowhere to say so. Radios (not buttons) so arrow keys move between options and
 * a screen reader announces "2 of 3".
 */
@Component({
  selector: 'app-theme-toggle',
  template: `
    <fieldset class="th">
      <legend class="th__legend">{{ locale.t('theme.legend') }}</legend>
      <div class="th__seg">
        @for (option of theme.options; track option) {
          <label class="th__opt" [class.th__opt--on]="theme.preference() === option">
            <input
              class="th__radio"
              type="radio"
              name="hk-theme"
              [value]="option"
              [checked]="theme.preference() === option"
              (change)="theme.setPreference(option)"
            />
            <span aria-hidden="true">{{ glyph[option] }}</span>
            {{ locale.t(label[option]) }}
          </label>
        }
      </div>
    </fieldset>
  `,
  styles: `
    .th {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    .th__legend {
      padding: 0 0 6px;
      font: 600 10.5px system-ui;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--kg-chrome-locked);
    }
    /* One inset track holding three equal cells, so the selected cell reads as a
       raised chip against it. Grid, not flex: equal columns keep the three labels
       from jostling as the language changes their widths. */
    .th__seg {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 2px;
      padding: 2px;
      border-radius: 9px;
      background: rgba(255, 255, 255, 0.06);
    }
    .th__opt {
      /* Contains the clipped radio below — without it the input positions
         against whatever ancestor happens to be positioned. */
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      /* 44px total with the track's padding — the app's touch-target floor. */
      min-height: 40px;
      padding: 3px 2px;
      border-radius: 7px;
      color: var(--kg-chrome-dim);
      font: 600 10.5px system-ui;
      line-height: 1.25;
      text-align: center;
      cursor: pointer;
    }
    .th__opt span {
      font-size: 13px;
      line-height: 1;
    }
    .th__opt:hover:not(.th__opt--on) {
      background: rgba(255, 255, 255, 0.07);
      color: var(--kg-chrome-ink);
    }
    /* Selected state carries a fill AND the brand tint, never colour alone. */
    .th__opt--on {
      background: var(--kg-brand-solid);
      color: var(--kg-on-brand);
    }
    /* The radio itself is the focus target; hiding it with display:none would
       take it out of the tab order, so it is clipped to the label instead. */
    .th__radio {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      margin: 0;
    }
    .th__opt:has(.th__radio:focus-visible) {
      outline: 2px solid var(--kg-chrome-ink);
      outline-offset: 1px;
    }
  `,
})
export class ThemeToggle {
  protected readonly locale = inject(LocaleService);
  protected readonly theme = inject(ThemeService);

  protected readonly glyph: Record<ThemePreference, string> = {
    system: '◐',
    light: '☀',
    dark: '☾',
  };

  protected readonly label = {
    system: 'theme.system',
    light: 'theme.light',
    dark: 'theme.dark',
  } as const;
}
