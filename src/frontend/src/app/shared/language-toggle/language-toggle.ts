import { Component, inject } from '@angular/core';
import { Locale, LocaleService } from '../../core/i18n/locale.service';

/**
 * Which language the app speaks, in the sidebar foot beside Appearance.
 *
 * A segmented control showing both languages at once, not a button that swaps between them.
 * The old button said only where you would land ("اردو"), which asks someone who cannot read
 * the current language to work out which state they are in from a single word. Both cells
 * are always on screen with the live one filled, so the answer is visible rather than
 * inferred — and each language is written in its own script, readable to the person who
 * needs it whichever side is lit.
 *
 * Mirrors {@link ThemeToggle} down to the track and chip, since the two sit together and are
 * the same kind of choice. Radios rather than buttons for the same reasons: arrow keys move
 * between them and a screen reader announces "1 of 2".
 *
 * This control is never hidden by a shop's menu arrangement — see `ChromeItem`.
 */
@Component({
  selector: 'app-language-toggle',
  template: `
    <fieldset class="lg">
      <legend class="lg__legend">{{ locale.t('lang.legend') }}</legend>
      <div class="lg__seg">
        @for (option of locale.options; track option) {
          <label class="lg__opt" [class.lg__opt--on]="locale.locale() === option">
            <input
              class="lg__radio"
              type="radio"
              name="hk-locale"
              [value]="option"
              [checked]="locale.locale() === option"
              (change)="locale.setLocale(option)"
            />
            <!-- Each language named in its own script, so the cell is legible to the person
                 who would want to switch to it. -->
            <span class="lg__name" [attr.lang]="option">{{ NAME[option] }}</span>
          </label>
        }
      </div>
    </fieldset>
  `,
  styles: `
    .lg {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    .lg__legend {
      padding: 0 0 6px;
      font: 600 10.5px system-ui;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--kg-chrome-locked);
    }
    /* Two equal cells in one inset track, matching Appearance above it. Grid, not flex, so
       the two scripts (which measure very differently) can't shift the divide between them. */
    .lg__seg {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 2px;
      padding: 2px;
      border-radius: 9px;
      background: rgba(255, 255, 255, 0.06);
    }
    .lg__opt {
      /* Contains the clipped radio below. */
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      /* 44px with the track's padding — the app's touch-target floor. */
      min-height: 40px;
      padding: 3px 2px;
      border-radius: 7px;
      color: var(--kg-chrome-dim);
      line-height: 1.25;
      text-align: center;
      cursor: pointer;
    }
    .lg__name {
      font: 600 12px system-ui;
    }
    /* Urdu needs its own size and a little headroom: the Nastaliq forms sit taller than the
       Latin cap height and read as cramped at the same 12px. */
    .lg__opt [lang='ur'] {
      font-size: 14px;
      line-height: 1.6;
    }
    .lg__opt:hover:not(.lg__opt--on) {
      background: rgba(255, 255, 255, 0.07);
      color: var(--kg-chrome-ink);
    }
    /* Selected carries a fill AND the brand tint, never colour alone. */
    .lg__opt--on {
      background: var(--kg-brand-solid);
      color: var(--kg-on-brand);
    }
    /* The radio is the focus target; display:none would drop it out of the tab order, so it
       is clipped to the label instead. */
    .lg__radio {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      margin: 0;
    }
    .lg__opt:has(.lg__radio:focus-visible) {
      outline: 2px solid var(--kg-chrome-ink);
      outline-offset: 1px;
    }
  `,
})
export class LanguageToggle {
  protected readonly locale = inject(LocaleService);

  /**
   * Endonyms, not translations: each language is labelled the way its own readers write it,
   * so neither cell changes when the language does. A control for leaving a language you
   * cannot read must not be written in that language.
   */
  protected readonly NAME: Record<Locale, string> = { en: 'English', ur: 'اردو' };
}
