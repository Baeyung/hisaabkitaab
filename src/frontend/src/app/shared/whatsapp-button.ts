import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { TranslationKey } from '../core/i18n/translations/en';
import { PlanService } from '../core/plan/plan.service';
import { RouterLink } from '@angular/router';
import { hasRealContact } from '../core/store/party.models';
import { StoreService } from '../core/store/store.service';
import { WhatsAppService } from '../core/store/whatsapp.service';
import { todayIso } from './date.util';
import { printableHtml } from './printable-html';

type State = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Print's twin, on the screens that are about one party: instead of putting the page on
 * paper it renders the same printout as a PDF and sends it to that party on WhatsApp.
 *
 * The button narrates the send itself rather than raising a toast — the shopkeeper is
 * looking straight at it when they press it, and a message that leaves the shop deserves
 * a confirmation that stays put instead of one that times out.
 */
@Component({
  selector: 'app-whatsapp-button',
  template: `
    <button
      type="button"
      class="rm-btn rm-btn--ghost rm-btn--wa rm-noprint"
      [attr.data-state]="state()"
      [disabled]="!clickable() || state() === 'sending'"
      [title]="hint()"
      (click)="ask()"
    >
      @switch (state()) {
        @case ('sending') {
          <span class="rm-btn__spin" aria-hidden="true"></span>
        }
        @case ('sent') {
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            aria-hidden="true"
          >
            <path d="M4 12.5 9.5 18 20 6.5" />
          </svg>
        }
        @default {
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M12.04 2C6.6 2 2.2 6.39 2.2 11.8c0 1.9.53 3.68 1.46 5.2L2 22l5.15-1.6a9.9 9.9 0 0 0 4.89 1.27h.01c5.43 0 9.84-4.39 9.84-9.8C21.89 6.4 17.47 2 12.04 2Zm5.76 13.9c-.24.68-1.4 1.3-1.94 1.34-.5.05-1.13.07-1.82-.11-.42-.11-.96-.29-1.65-.58-2.9-1.24-4.8-4.11-4.94-4.3-.15-.19-1.19-1.55-1.19-2.96 0-1.4.75-2.09 1.01-2.38.27-.29.58-.36.78-.36l.55.01c.18.01.42-.07.65.49.24.57.82 1.97.89 2.12.07.14.12.31.02.5-.1.19-.15.31-.29.48-.15.16-.31.37-.44.5-.15.14-.3.3-.13.58.17.29.76 1.23 1.63 2 1.11.98 2.05 1.29 2.34 1.43.29.15.46.12.63-.07.17-.19.73-.84.92-1.13.19-.29.39-.24.65-.14.27.09 1.67.78 1.96.92.29.15.48.22.55.34.07.12.07.68-.17 1.35Z"
            />
          </svg>
        }
      }
      {{ locale.t(label()) }}
    </button>

    <dialog #dlg class="rm-dialog" (cancel)="dismiss($event)" (click)="onBackdrop($event)">
      <h2 class="rm-dialog__title">{{ locale.t('whatsapp.title') }}</h2>
      @if (needsNumber()) {
        <p class="rm-dialog__body">{{ locale.t('whatsapp.noNumber', { name: partyName() }) }}</p>
        <div class="rm-dialog__actions">
          <button type="button" class="rm-btn rm-btn--ghost" (click)="dismiss($event)">
            {{ locale.t('common.cancel') }}
          </button>
          <a
            class="rm-btn rm-btn--primary"
            [routerLink]="stores.link('settings/party')"
            (click)="close()"
          >
            {{ locale.t('whatsapp.addNumber') }}
          </a>
        </div>
      } @else {
        <p class="rm-dialog__body">
          {{
            locale.t('whatsapp.confirm', {
              document: document(),
              name: partyName(),
              contact: contact() ?? '',
            })
          }}
          @if (quotaNote(); as note) {
            <span class="rm-dialog__note">{{ note }}</span>
          }
        </p>
        <div class="rm-dialog__actions">
          <button type="button" class="rm-btn rm-btn--ghost" (click)="dismiss($event)">
            {{ locale.t('common.cancel') }}
          </button>
          <button type="button" class="rm-btn rm-btn--primary" (click)="send($event)">
            {{ locale.t('whatsapp.send') }}
          </button>
        </div>
      }
    </dialog>
  `,
  imports: [RouterLink],
})
export class WhatsAppButton {
  /** Null for a walk-in cash sale, or a party typed in but not saved yet — nothing to send to. */
  readonly partyId = input.required<string | null>();
  readonly partyName = input.required<string>();
  readonly contact = input.required<string | null>();

  /** What is being sent, already in the reader's language: "Bill #1042", "Khata statement". */
  readonly document = input.required<string>();

  /**
   * The same thing without its number — "Bill", "Khata statement", "Cashbook". It reads
   * inside a sentence in the WhatsApp template, where "Bill #1042" would not.
   */
  readonly action = input.required<string>();

  /**
   * Runs before the page is captured — the ledger statement uses it to ask about expanding
   * bill details, exactly as Print does. Returning false calls the whole thing off.
   */
  readonly beforeCapture = input<() => Promise<boolean>>();

  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(WhatsAppService);
  private readonly plan = inject(PlanService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly state = signal<State>('idle');

  /**
   * Whether the plan this shop runs on pays for WhatsApp. Only the *owner's* own shops are
   * judged on the signed-in user's plan — a shop shared with them is its owner's to pay for
   * and none of this, exactly as `planLimitGuard` reads it.
   */
  protected readonly onPlan = computed(
    () => this.stores.role() !== 'OWNER' || this.plan.whatsappAllowed(),
  );

  /**
   * How many messages are left this month, or null when there is no number worth showing —
   * see {@link PlanService.whatsappRemaining}. Only the owner's own shops are metered against
   * the signed-in user's plan, exactly as {@link onPlan} reads it; in someone else's shop the
   * count belongs to that owner and is not ours to show.
   */
  protected readonly remaining = computed(() =>
    this.stores.role() === 'OWNER' ? this.plan.whatsappRemaining() : null,
  );

  /** Whether this month's quota is spent. Only ever true in a shop the signed-in user owns. */
  protected readonly outOfQuota = computed(
    () => this.stores.role() === 'OWNER' && this.plan.whatsappExhausted(),
  );

  /**
   * What the send costs, shown in the dialog beneath what it does — the last moment before a
   * message is spent is the honest place to say how many are left. Null when there is no
   * number to show, which is also when the line is left out entirely.
   */
  protected readonly quotaNote = computed(() => {
    const left = this.remaining();
    return left === null ? null : this.locale.t('whatsapp.quotaLeft', { left: String(left) });
  });

  /**
   * A saved party without a number a person answers — no number at all, or the placeholder
   * the backend stamps on a party created in passing. The button stays live for this: the
   * dialog sends them off to add one instead of going quiet.
   */
  protected readonly needsNumber = computed(
    () => !!this.partyId() && !hasRealContact(this.contact()),
  );

  /** Worth opening the dialog for: a saved party, on a plan that covers sending, with quota left. */
  protected readonly clickable = computed(
    () => this.onPlan() && !this.outOfQuota() && !!this.partyId(),
  );

  /** All of that, and a real number to send to. */
  protected readonly sendable = computed(() => this.clickable() && !this.needsNumber());

  private static readonly LABELS: Record<State, TranslationKey> = {
    idle: 'whatsapp.send',
    sending: 'whatsapp.sending',
    sent: 'whatsapp.sent',
    error: 'whatsapp.failed',
  };

  protected readonly label = computed(() => WhatsAppButton.LABELS[this.state()]);

  /**
   * Says why the button is dead, since a disabled control can't say it itself. Being out of
   * messages and not paying for WhatsApp read as separate reasons on purpose: one is over
   * next month, the other only ends by upgrading.
   */
  protected readonly hint = computed(() => {
    if (this.sendable()) return '';
    if (!this.onPlan()) return this.locale.t('whatsapp.notOnPlan');
    if (this.outOfQuota()) return this.locale.t('whatsapp.noQuota');
    return this.locale.t('whatsapp.noNumber', { name: this.partyName() });
  });

  protected ask(): void {
    this.state.set('idle');
    this.dlg().nativeElement.showModal();
  }

  protected dismiss(event: Event): void {
    event.preventDefault();
    this.close();
  }

  /** Closes without swallowing the click — the "add a number" link has a navigation to do. */
  protected close(): void {
    this.dlg().nativeElement.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dlg().nativeElement) {
      this.dismiss(event);
    }
  }

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    this.dlg().nativeElement.close();

    const partyId = this.partyId();
    if (!partyId) {
      return;
    }

    this.state.set('sending');
    try {
      const prepare = this.beforeCapture();
      if (prepare && !(await prepare())) {
        this.state.set('idle');
        return;
      }
      await this.api.send(
        partyId,
        printableHtml(),
        this.filename(),
        this.action(),
        this.locale.locale(),
      );
      this.state.set('sent');
    } catch {
      this.state.set('error');
    }

    // Either way: a send spends a message, and a refusal means the count on hand was already
    // out of date. Deliberately not awaited — the button has said what happened and must not
    // wait on a second request to say it.
    void this.plan.refresh().catch(() => undefined);
  }

  /**
   * The name the party sees on the attachment. A bill keeps its number, which survives
   * either language; an Urdu document name slugs away to nothing, so the date carries the
   * distinction instead — two statements in a chat should never share a filename.
   */
  private filename(): string {
    const slug = this.document()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${slug || 'hisaabkitaab'}-${todayIso()}.pdf`;
  }
}
