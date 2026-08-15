import { Component, inject, input } from '@angular/core';
import { Locale, LocaleService } from '../../core/i18n/locale.service';

/**
 * Which language the app speaks, in the sidebar foot beside Appearance.
 *
 * A segmented control showing both languages at once, not a button that swaps between them.
 * The old button said only where you would land ("اردو"), which asks someone who cannot read
 * the current language to work out which state they are in from a single word. Both cells
 * are always on screen with the live one filled, so the answer is visible rather than
 * inferred — labelled EN/UR, which stay put whichever language is live.
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
      <!-- Shown only in the sidebar foot, where the caption keeps this track from reading as
           another row of Appearance above it. In a bar the codes speak for themselves, so the
           legend is there for screen readers alone. -->
      <legend [class]="legend() ? 'lg__legend' : 'sr-only'">{{ locale.t('lang.legend') }}</legend>
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
            <span class="lg__name">{{ NAME[option] }}</span>
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
    /* Matches the Appearance legend it sits beside. */
    .lg__legend {
      padding: 0 0 6px;
      font: 600 10.5px system-ui;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: color-mix(in srgb, currentColor 58%, transparent);
    }
    /* Two equal cells in one inset track. The cells set their own width from the code plus
       padding, so the track is a compact chip beside the bar's buttons; where the control
       sits in a column (the sidebar foot) the 1fr columns stretch it to the track above. */
    .lg__seg {
      display: grid;
      grid-template-columns: repeat(2, minmax(36px, 1fr));
      gap: 2px;
      padding: 2px;
      border-radius: 9px;
      /* Mixed from the surrounding ink, not a fixed white tint: this control also sits on the
         auth panel, which is cream in light mode where a white track disappears. */
      background: color-mix(in srgb, currentColor 8%, transparent);
    }
    .lg__opt {
      /* Contains the clipped radio below. */
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      /* --kg-control-h tall once the track's 2px padding is added back — the one height
         the appearance track and the buttons beside it are also cut to. */
      min-height: calc(var(--kg-control-h) - 4px);
      padding: 0 12px;
      border-radius: 7px;
      color: color-mix(in srgb, currentColor 72%, transparent);
      cursor: pointer;
    }
    .lg__name {
      font: 600 12px/1 system-ui;
      letter-spacing: 0.06em;
    }
    .lg__opt:hover:not(.lg__opt--on) {
      background: color-mix(in srgb, currentColor 10%, transparent);
      color: inherit;
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
      outline: 2px solid currentColor;
      outline-offset: 1px;
    }
  `,
})
export class LanguageToggle {
  /** Show the "Language" caption — on in the sidebar foot, off in the bars. */
  readonly legend = input(false);

  protected readonly locale = inject(LocaleService);

  /**
   * ISO codes, not translations: neither cell changes when the language does, and a control
   * for leaving a language you cannot read must not be written in that language.
   */
  protected readonly NAME: Record<Locale, string> = { en: 'EN', ur: 'UR' };
}
