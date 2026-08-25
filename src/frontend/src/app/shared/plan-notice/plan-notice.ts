import { Component, computed, inject, signal } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { PlanService, WARN_WITHIN_DAYS, daysUntil } from '../../core/plan/plan.service';

/**
 * Session storage, not local: a dismissal is meant to last the sitting, not the week. It holds
 * the urgency it was made at ("soon", "urgent", "ended") so an escalation reopens the strip.
 */
const DISMISSED_KEY = 'hk.plan.dismissed';

/**
 * The strip that says the plan is about to run out — or has.
 *
 * It lives above the scrolling content rather than inside a page, so it is on every screen and
 * stays put while the screen scrolls. That is the whole point: it used to sit on the shop
 * picker alone, which an owner with one shop passes through once and never sees again, and the
 * first they knew of the lockout was the lockout.
 *
 * Renders nothing until the plan is known, and nothing while the end is more than a week off —
 * a notice that is always there is a notice nobody reads.
 *
 * It can be put away, but only for the session and only at the urgency it was put away at: the
 * next time the app is opened, and the moment the countdown escalates, it comes back. Dismissal
 * is for "yes, I know, let me finish this entry" — it is not a way to turn the lockout off.
 */
@Component({
  selector: 'app-plan-notice',
  template: `
    @if (notice(); as n) {
      <p role="status" class="pn" [class]="'pn pn--' + n.level">
        <!-- Relative first, absolute after: "2 days left" is what decides whether to act
             today, the date is what you act on. -->
        <span class="pn__count">{{ locale.t(n.countKey, n.countParams) }}</span>
        <span class="pn__text">{{ locale.t(n.textKey, { date: endsOn() }) }}</span>
        <button
          type="button"
          class="pn__close"
          [attr.aria-label]="locale.t('plan.dismiss')"
          (click)="dismiss()"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <span class="pn__fuse" aria-hidden="true" [style.--pn-left.%]="n.left"></span>
      </p>
    }
  `,
  styles: `
    /* A grid rather than a wrapping row: the countdown and the close button hold the ends of
       the line at every width, and it is only the sentence between them that wraps. */
    .pn {
      position: relative;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: baseline;
      gap: 2px 10px;
      margin: 0;
      padding: 8px var(--kg-page-pad) 9px;
      font-size: 13px;
      line-height: 1.35;
      color: var(--kg-ink);
      background: var(--kg-strip);
      border-bottom: 1px solid var(--kg-strip-line);
    }

    /* Amber while there is still a week to arrange it, the payable red once it is days or
       gone — the same two colours the ledger already uses for "watch this" and "this is
       against you", so the escalation needs no legend. */
    .pn--soon {
      --kg-strip: color-mix(in srgb, var(--kg-amber) 12%, transparent);
      --kg-strip-line: color-mix(in srgb, var(--kg-amber) 34%, transparent);
      --kg-strip-ink: var(--kg-amber);
    }
    .pn--urgent,
    .pn--ended {
      --kg-strip: var(--kg-tint-out-hover);
      --kg-strip-line: var(--kg-tint-out-line);
      --kg-strip-ink: var(--kg-out);
    }

    .pn__count {
      flex: none;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.01em;
      color: var(--kg-strip-ink);
    }

    .pn__text {
      min-width: 0;
      color: var(--kg-ink);
    }

    /* On a phone the sentence has no room beside the countdown, so it drops to its own line
       under it — still one block, still with the close button on the first line. */
    @media (max-width: 520px) {
      .pn {
        grid-template-columns: 1fr auto;
      }
      /* Placed rather than flowed: auto-placement would push the close button below the
         sentence instead of keeping it on the countdown's line. */
      .pn__close {
        grid-row: 1;
        grid-column: 2;
      }
      .pn__text {
        grid-row: 2;
        grid-column: 1 / -1;
      }
    }

    .pn__close {
      display: grid;
      place-items: center;
      align-self: center;
      width: 30px;
      height: 30px;
      /* Pushed to the far end, and its box eats back into the strip's own padding so a
         30px target doesn't make the strip 30px tall. */
      margin-block: -6px;
      margin-inline: auto -8px;
      padding: 0;
      color: var(--kg-strip-ink);
      background: none;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
    }

    .pn__close:hover {
      background: color-mix(in srgb, var(--kg-strip-ink) 14%, transparent);
    }

    .pn__close:focus-visible {
      outline: 2px solid var(--kg-strip-ink);
      outline-offset: -2px;
    }

    /* The week burning down, drawn on the strip's own bottom edge: the one thing here that
       changes day to day, so it is the one thing drawn rather than written. Empty at the end. */
    .pn__fuse {
      position: absolute;
      inset-block-end: -1px;
      inset-inline-start: 0;
      width: var(--pn-left, 0%);
      height: 2px;
      background: var(--kg-strip-ink);
    }
  `,
})
export class PlanNotice {
  protected readonly locale = inject(LocaleService);
  private readonly plan = inject(PlanService);

  constructor() {
    // Cheap: returns the session's cached plan when a guard has already read it, and covers
    // the routes no guard reads it on — a shop shared by another owner still belongs to a
    // user whose own plan can lapse under them.
    void this.plan.load().catch(() => null);
  }

  /** The urgency the user has already waved away this session, if any. */
  private readonly dismissed = signal(sessionStorage.getItem(DISMISSED_KEY));

  protected readonly notice = computed(() => {
    const state = this.state();
    return state !== null && state.level !== this.dismissed() ? state : null;
  });

  /** Puts the strip away until the app is next opened, or until the news gets worse. */
  dismiss(): void {
    const level = this.notice()?.level;
    if (level === undefined) return;
    sessionStorage.setItem(DISMISSED_KEY, level);
    this.dismissed.set(level);
  }

  private readonly state = computed(() => {
    if (this.plan.expired()) {
      return {
        level: 'ended',
        countKey: 'plan.badge.ended' as TranslationKey,
        countParams: undefined,
        textKey: 'plan.ended' as TranslationKey,
        left: 0,
      };
    }
    const iso = this.plan.expiresOn();
    if (iso === null || !this.plan.endingSoon()) {
      return null;
    }
    const days = daysUntil(iso);
    return {
      level: days <= 2 ? 'urgent' : 'soon',
      countKey: (days <= 0
        ? 'plan.badge.lastDay'
        : days === 1
          ? 'plan.badge.oneDayLeft'
          : 'plan.badge.daysLeft') as TranslationKey,
      countParams: { days: String(days) },
      textKey: 'plan.endingSoon' as TranslationKey,
      left: Math.max(0, Math.min(100, (days / WARN_WITHIN_DAYS) * 100)),
    };
  });

  /** The plan's last day, worded as the app words dates elsewhere (cashbook, dashboard). */
  protected readonly endsOn = computed(() => {
    const iso = this.plan.expiresOn();
    return iso ? this.locale.date(iso) : '';
  });
}
