import { Component, computed, inject, input, model, signal } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';

/**
 * What a new password has to have, one entry per line the user sees. Split into
 * separate tests rather than read off PASSWORD_PATTERN because the point is to
 * say which part is missing, not just that something is.
 */
export const PASSWORD_RULES = [
  { key: 'validation.password.length', test: (v: string) => v.length >= 8 },
  { key: 'validation.password.digit', test: (v: string) => /\d/.test(v) },
  { key: 'validation.password.special', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

/**
 * The same three rules as one regex, for the form validator and mirrored by the
 * backend @Pattern on SignupRequest/ResetPasswordRequest. password-field.spec.ts
 * holds the two in step.
 *
 * Only new passwords are held to this — login takes whatever an older account
 * was created with.
 */
export const PASSWORD_PATTERN = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/**
 * New-password entry: a password box with a live checklist of the rules under it.
 *
 * The list appears once the field is in use and each row flips as they type, so
 * "too weak" is never a surprise at submit time. It stays out of the way until
 * then — an untouched form shouldn't open with three red crosses.
 *
 * Implements `FormValueControl`, so `[formField]` binds it like a native input
 * and hands it `disabled` for free.
 */
@Component({
  selector: 'app-password-field',
  template: `
    <input
      class="fld__input"
      type="password"
      autocomplete="new-password"
      [attr.id]="inputId()"
      [attr.aria-describedby]="inputId() + '-rules'"
      [attr.required]="required() || null"
      [value]="value()"
      [disabled]="disabled()"
      (input)="value.set($any($event.target).value)"
      (focus)="focused.set(true)"
      (blur)="focused.set(false)"
    />
    <!-- Kept in the DOM even while hidden: it is this input's aria-describedby,
         and the requirements are worth hearing before anything is typed. -->
    <ul class="pwd" [attr.id]="inputId() + '-rules'" [hidden]="!open()">
      @for (r of results(); track r.key) {
        <li class="pwd__rule" [class.pwd__rule--ok]="r.ok">
          <span class="pwd__mark" aria-hidden="true">{{ r.ok ? '✓' : '✗' }}</span>
          <span class="sr-only">{{ locale.t(r.ok ? 'validation.password.met' : 'validation.password.missing') }}</span>
          {{ locale.t(r.key) }}
        </li>
      }
    </ul>
  `,
  styles: `
    /* The host takes the field's width; without this the input keeps its own
       default size and sits narrower than every other box on the form. */
    :host {
      display: block;
    }
    input {
      width: 100%;
    }
    .pwd {
      list-style: none;
      margin: 2px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .pwd__rule {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--kg-faint);
    }
    .pwd__rule--ok {
      color: var(--kg-in);
    }
    .pwd__mark {
      /* Fixed width so the labels line up whichever mark is showing. */
      width: 11px;
      text-align: center;
      font-weight: 700;
    }
  `,
})
export class PasswordField implements FormValueControl<string> {
  protected readonly locale = inject(LocaleService);

  readonly value = model.required<string>();
  readonly disabled = input(false);
  /** Filled in by `[formField]` off the `required()` rule, same as `disabled`. */
  readonly required = input(false);
  /** Put on the inner input so an outside `<label for>` still reaches it. */
  readonly inputId = input.required<string>();

  protected readonly focused = signal(false);
  /** Up while the field is in use, and stays up over anything already typed. */
  protected readonly open = computed(() => this.focused() || this.value() !== '');

  protected readonly results = computed(() => {
    const value = this.value();
    return PASSWORD_RULES.map((r) => ({ key: r.key, ok: r.test(value) }));
  });
}
