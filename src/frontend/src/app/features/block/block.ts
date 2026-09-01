import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LocaleService } from '../../core/i18n/locale.service';
import { LanguageToggle } from '../../shared/language-toggle/language-toggle';
import { ToastService } from '../../shared/toast/toast.service';
import { environment } from '../../../environments/environment';

/**
 * What the shop's customer sees when they follow the opt-out button on a WhatsApp message:
 * one question, and the honest answer to it. Confirming here stops every future document this
 * shop would have sent to this number.
 *
 * Public and account-less by necessity — the person reading it is a khata holder, not a user of
 * the app — so the `storeId:partyId` token out of the link is the whole of what identifies
 * them, and the page asks for nothing else. The same page serves the shop's own people, who
 * get the same template and the same way out of it.
 *
 * The HTTP calls sit here rather than in a service: no other screen speaks to /api/block, and
 * the store-scoped services all resolve their URL through a selected store, which this has not
 * got. Deliberately not routed through StoreService for that reason.
 */
@Component({
  selector: 'app-block',
  imports: [LanguageToggle],
  template: `
    <div class="blk">
      <header class="blk__top">
        <span class="blk__brand">
          <svg class="blk__mark" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.4 2.5h8v19h-8zM12.6 2.5h8v19h-8z" fill="currentColor" />
            <path d="M3.4 5.1h8v2.6h-8zM12.6 5.1h8v2.6h-8z" fill="#c98a2b" />
          </svg>
          {{ locale.t('app.name') }}
        </span>
        <app-language-toggle />
      </header>

      <main class="blk__card rm-card">
        @if (loading()) {
          <p class="blk__muted">{{ locale.t('block.loading') }}</p>
        } @else if (invalid()) {
          <h1 class="blk__title">{{ locale.t('block.invalid.title') }}</h1>
          <p class="blk__body">{{ locale.t('block.invalid.body') }}</p>
        } @else if (status(); as it) {
          @if (it.blocked) {
            <h1 class="blk__title">{{ locale.t('block.done.title') }}</h1>
            <p class="blk__body">
              {{ locale.t('block.done.body', { store: it.storeName, number: number() }) }}
            </p>
            <p class="blk__note">
              {{ locale.t('block.support') }}
              <a href="mailto:support@hisaabkitaab.shop">support&#64;hisaabkitaab.shop</a>
            </p>
          } @else {
            <h1 class="blk__title">{{ locale.t('block.ask.title', { store: it.storeName }) }}</h1>

            <dl class="blk__facts">
              <div>
                <dt>{{ locale.t('block.facts.store') }}</dt>
                <dd>{{ it.storeName }}</dd>
              </div>
              <div>
                <dt>{{ locale.t('block.facts.name') }}</dt>
                <dd>{{ it.recipientName }}</dd>
              </div>
              <div>
                <dt>{{ locale.t('block.facts.number') }}</dt>
                <dd class="blk__number">{{ number() }}</dd>
              </div>
            </dl>

            <p class="blk__warn" role="note">{{ locale.t('block.warning') }}</p>

            <button
              type="button"
              class="rm-btn rm-btn--danger blk__cta"
              [disabled]="blocking()"
              (click)="confirm()"
            >
              {{ blocking() ? locale.t('block.confirming') : locale.t('block.confirm') }}
            </button>

            <p class="blk__note">{{ locale.t('block.keep') }}</p>
          }
        }
      </main>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--kg-desk);
      color: var(--kg-ink);
    }
    .blk {
      max-width: 520px;
      margin: 0 auto;
      padding: 20px clamp(16px, 5vw, 24px) 48px;
    }
    .blk__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-block: 8px 20px;
    }
    .blk__brand {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      font-weight: 600;
      font-size: 16px;
    }
    .blk__mark {
      width: 20px;
      height: 20px;
      color: var(--kg-brand);
    }
    .blk__card {
      padding: clamp(20px, 5vw, 28px);
    }
    .blk__title {
      margin: 0 0 12px;
      font-size: clamp(20px, 5vw, 24px);
      line-height: 1.35;
    }
    .blk__body {
      margin: 0 0 16px;
      font-size: 15px;
      line-height: 1.6;
    }
    .blk__muted {
      margin: 0;
      color: var(--kg-muted);
    }
    /* Facts, not prose: what is about to be stopped, in a shape that survives a
       glance on a phone. Rows stack their label above the value in both scripts. */
    .blk__facts {
      margin: 0 0 20px;
      padding: 14px 16px;
      background: var(--kg-fill-subtle);
      border-radius: 10px;
      display: grid;
      gap: 10px;
    }
    .blk__facts dt {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--kg-muted);
    }
    .blk__facts dd {
      margin: 2px 0 0;
      font-size: 15px;
      font-weight: 500;
    }
    /* The number reads left-to-right whichever way the page does. */
    .blk__number {
      direction: ltr;
      unicode-bidi: isolate;
    }
    .blk__warn {
      margin: 0 0 20px;
      padding: 12px 14px;
      font-size: 14px;
      line-height: 1.55;
      color: var(--kg-out);
      background: color-mix(in srgb, var(--kg-out) 8%, transparent);
      border-inline-start: 3px solid var(--kg-out);
      border-radius: 8px;
    }
    .blk__cta {
      width: 100%;
    }
    .blk__note {
      margin: 16px 0 0;
      font-size: 13px;
      line-height: 1.6;
      color: var(--kg-muted);
    }
  `,
})
export class Block {
  /** `storeId:recipientId`, straight off the route — the whole of what the link carries. */
  readonly token = input.required<string>();

  protected readonly locale = inject(LocaleService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  protected readonly status = signal<BlockStatus | null>(null);
  protected readonly loading = signal(true);

  /**
   * One "this link is not valid" for everything: an id from another shop, a party whose number
   * has since been cleared, a mangled forward. The backend answers them all the same way and
   * so does this — there is nothing the reader could do differently for any of them.
   */
  protected readonly invalid = signal(false);

  protected readonly blocking = signal(false);

  /** As much of the number as we are shown: •••• and its last four digits. */
  protected readonly number = computed(() => {
    const last4 = this.status()?.contactLast4;
    return last4 ? `•••• ${last4}` : '';
  });

  constructor() {
    effect(() => {
      const token = this.token();
      this.loading.set(true);
      this.invalid.set(false);
      firstValueFrom(this.http.get<BlockStatus>(this.url(token)))
        .then((status) => this.status.set(status))
        .catch(() => this.invalid.set(true))
        .finally(() => this.loading.set(false));
    });
  }

  async confirm(): Promise<void> {
    if (this.blocking()) {
      return;
    }
    this.blocking.set(true);
    try {
      // The answer to the POST is the same shape the GET returns and is the newer of the two,
      // so it replaces it outright rather than prompting a reload.
      this.status.set(
        await firstValueFrom(this.http.post<BlockStatus>(this.url(this.token()), null)),
      );
    } catch {
      this.toast.error(this.locale.t('block.failed'));
    } finally {
      this.blocking.set(false);
    }
  }

  private url(token: string): string {
    return `${environment.apiUrl}/block/${encodeURIComponent(token)}`;
  }
}

/** Mirrors the backend `BlockStatus`. Only what the page is allowed to show. */
interface BlockStatus {
  storeName: string;
  recipientName: string;
  contactLast4: string;
  blocked: boolean;
}
