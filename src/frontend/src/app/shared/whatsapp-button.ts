import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { TranslationKey } from '../core/i18n/translations/en';
import { PlanService } from '../core/plan/plan.service';
import { hasRealContact } from '../core/store/party.models';
import { PartyService } from '../core/store/party.service';
import { StoreRole } from '../core/store/store.models';
import { StoreService } from '../core/store/store.service';
import { WhatsAppService } from '../core/store/whatsapp.service';
import { ShareRecipient, ShareTarget } from '../core/store/whatsapp.models';
import { PhoneField } from './phone-field/phone-field';
import { todayIso } from './date.util';
import { printableHtml } from './printable-html';
import { CaptureModeService } from './capture-mode.service';

type State = 'idle' | 'sending' | 'sent' | 'partial' | 'error';

/** A tick in the recipient list, keyed the way the request names people. */
type Pick = `${ShareTarget['kind']}:${string}`;

const key = (target: ShareTarget): Pick => `${target.kind}:${target.id}`;

const ROLE_LABELS: Record<StoreRole, TranslationKey> = {
  OWNER: 'members.role.owner',
  EDITOR: 'members.role.editor',
  VIEWER: 'members.role.viewer',
};

/**
 * Print's twin: instead of putting the page on paper it renders the same printout as a PDF
 * and sends it on WhatsApp — to the party a bill or statement is about, to the people who
 * work in the shop, or to several of them at once.
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
      {{ label() }}
    </button>

    <dialog #dlg class="rm-dialog" (cancel)="dismiss($event)" (click)="onBackdrop($event)">
      <h2 class="rm-dialog__title">{{ locale.t('whatsapp.title') }}</h2>
      <p class="rm-dialog__body">
        {{ locale.t('whatsapp.pick', { document: document() }) }}
        @if (quotaNote(); as note) {
          <span class="rm-dialog__note">{{ note }}</span>
        }
      </p>

      @if (partyId(); as id) {
        <fieldset class="wa-set">
          <legend class="wa-group">{{ locale.t('whatsapp.group.party') }}</legend>
          <label class="wa-row">
            <input
              type="checkbox"
              [checked]="partyPicked()"
              [disabled]="partyBlocked()"
              (change)="toggleParty(id)"
            />
            <span class="wa-row__name">{{ partyName() }}</span>
            @if (partyBlocked()) {
              <span class="wa-row__note">{{ locale.t('whatsapp.optedOut') }}</span>
            } @else if (!hasNumber()) {
              <span class="wa-row__note">{{ locale.t('whatsapp.needsNumber') }}</span>
            }
          </label>

          @if (partyPicked() && !partyBlocked() && !hasNumber()) {
            <div class="wa-field">
              <p class="rm-dialog__body">
                {{ locale.t('whatsapp.noNumber', { name: partyName() }) }}
              </p>
              <app-phone-field [(value)]="typed" />
            </div>
          }
        </fieldset>
      }

      <fieldset class="wa-set">
        <legend class="wa-group">{{ locale.t('whatsapp.group.people') }}</legend>
        @if (loadingPeople()) {
          <p class="wa-empty">{{ locale.t('whatsapp.loadingPeople') }}</p>
        } @else if (people().length === 0) {
          <p class="wa-empty">{{ locale.t('whatsapp.noPeople') }}</p>
        } @else {
          @for (person of people(); track person.userId) {
            <label class="wa-row">
              <input
                type="checkbox"
                [checked]="userPicked(person.userId)"
                [disabled]="person.blocked"
                (change)="toggleUser(person.userId)"
              />
              <span class="wa-row__name">{{ person.name }}</span>
              <span class="wa-row__note">{{
                person.blocked ? locale.t('whatsapp.optedOut') : locale.t(roleLabel(person.role))
              }}</span>
            </label>
          }
        }
      </fieldset>

      <div class="rm-dialog__actions">
        <button type="button" class="rm-btn rm-btn--ghost" (click)="dismiss($event)">
          {{ locale.t('common.cancel') }}
        </button>
        <button
          type="button"
          class="rm-btn rm-btn--primary"
          [disabled]="!sendable()"
          (click)="send($event)"
        >
          {{ locale.t('whatsapp.send') }}
        </button>
      </div>
    </dialog>
  `,
  styles: `
    /* A checkbox group is a fieldset so its heading is read out with the boxes in it. */
    .wa-set {
      margin: 0;
      padding: 0;
      border: 0;
    }
    .wa-set + .wa-set {
      margin-top: 16px;
    }
    .wa-group {
      padding: 0;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--kg-muted);
    }
    .wa-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 0;
      font-size: 14px;
      cursor: pointer;
    }
    .wa-row__name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .wa-row__note,
    .wa-empty {
      font-size: 12px;
      color: var(--kg-muted);
    }
    .wa-empty {
      margin: 0;
    }
    .wa-field {
      margin: 4px 0 8px;
    }
    .rm-dialog__actions {
      margin-top: 20px;
    }
  `,
  imports: [PhoneField],
})
export class WhatsAppButton {
  /**
   * The party this screen is about, when it is about one — a bill, a khata statement. Null
   * on the shop's own printouts (the cashbook, the dashboard), and on a walk-in cash sale or
   * a party typed in but not saved yet, where there is no khata to send to.
   */
  readonly partyId = input<string | null>(null);
  readonly partyName = input<string>('');
  readonly contact = input<string | null>(null);

  /** What is being sent, already in the reader's language: "Bill #1042", "Cashbook". */
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
  private readonly parties = inject(PartyService);
  private readonly plan = inject(PlanService);
  private readonly capture = inject(CaptureModeService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly state = signal<State>('idle');

  /** The people who work in the shop, fetched the first time the dialog is opened. */
  protected readonly people = signal<ShareRecipient[]>([]);
  protected readonly loadingPeople = signal(false);
  private loaded = false;

  /**
   * Whether this screen's party has told the shop to stop messaging them. Known only once the
   * dialog has been opened and the list fetched, so it starts false — which is also what it
   * stays for a screen that is about no party at all.
   */
  protected readonly partyBlocked = signal(false);

  /** Who is ticked right now. */
  protected readonly picked = signal<ReadonlySet<Pick>>(new Set());

  /** What the last send did, for the button's label and its tooltip. */
  private readonly sentCount = signal(0);
  private readonly attempted = signal(0);
  private readonly failedNames = signal<string[]>([]);

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

  /** The number typed into the dialog when the party has none of its own. */
  protected readonly typed = signal('');

  /** What was typed and saved here, so the dialog stops asking after a successful send. */
  private readonly saved = signal<string | null>(null);

  /**
   * Whether the party has a number a person answers — a party created in passing carries the
   * placeholder the backend stamps on it, which is nobody's. False means the dialog asks for
   * one and saves it on the party before sending.
   */
  protected readonly hasNumber = computed(() => hasRealContact(this.saved() ?? this.contact()));

  protected readonly partyPicked = computed(() => {
    const id = this.partyId();
    return !!id && this.picked().has(key({ kind: 'PARTY', id }));
  });

  /** Same shape the backend's `@Pattern` on Party.contact allows, minus the empty case. */
  protected readonly validTyped = computed(() => /^\d{7,15}$/.test(this.typed()));

  /** Everyone ticked, in the shape the send takes. */
  protected readonly chosen = computed<ShareTarget[]>(() => {
    const picked = this.picked();
    const id = this.partyId();
    const targets: ShareTarget[] = [];
    if (id && picked.has(key({ kind: 'PARTY', id }))) {
      targets.push({ kind: 'PARTY', id });
    }
    for (const person of this.people()) {
      if (picked.has(key({ kind: 'USER', id: person.userId }))) {
        targets.push({ kind: 'USER', id: person.userId });
      }
    }
    return targets;
  });

  /** Somebody to send to, and a number for them: the party's own, or one typed in its place. */
  protected readonly sendable = computed(
    () =>
      this.chosen().length > 0 && (!this.partyPicked() || this.hasNumber() || this.validTyped()),
  );

  /** Worth opening the dialog for: a plan that covers sending, with messages left on it. */
  protected readonly clickable = computed(() => this.onPlan() && !this.outOfQuota());

  private static readonly LABELS: Record<Exclude<State, 'partial'>, TranslationKey> = {
    idle: 'whatsapp.send',
    sending: 'whatsapp.sending',
    sent: 'whatsapp.sent',
    error: 'whatsapp.failed',
  };

  protected readonly label = computed(() => {
    const state = this.state();
    return state === 'partial'
      ? this.locale.t('whatsapp.partial', {
          sent: String(this.sentCount()),
          total: String(this.attempted()),
        })
      : this.locale.t(WhatsAppButton.LABELS[state]);
  });

  /**
   * Says why the button is dead, since a disabled control can't say it itself. Being out of
   * messages and not paying for WhatsApp read as separate reasons on purpose: one is over
   * next month, the other only ends by upgrading. Once a send has been tried it gives up that
   * job to naming who the message did not reach, which the label has no room for.
   */
  protected readonly hint = computed(() => {
    if (!this.onPlan()) return this.locale.t('whatsapp.notOnPlan');
    if (this.outOfQuota()) return this.locale.t('whatsapp.noQuota');
    const missed = this.failedNames();
    return missed.length ? this.locale.t('whatsapp.missed', { names: missed.join(', ') }) : '';
  });

  protected roleLabel(role: StoreRole): TranslationKey {
    return ROLE_LABELS[role];
  }

  protected userPicked(userId: string): boolean {
    return this.picked().has(key({ kind: 'USER', id: userId }));
  }

  protected toggleParty(id: string): void {
    this.toggle({ kind: 'PARTY', id });
  }

  protected toggleUser(userId: string): void {
    this.toggle({ kind: 'USER', id: userId });
  }

  protected toggle(target: ShareTarget): void {
    this.picked.update((picked) => {
      const next = new Set(picked);
      const id = key(target);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  /**
   * Opens the picker, with the party this screen is about already ticked — on a bill or a
   * statement that is nearly always the answer, and one press should still be enough.
   */
  protected ask(): void {
    this.state.set('idle');
    this.failedNames.set([]);
    const id = this.partyId();
    this.picked.set(id ? new Set([key({ kind: 'PARTY', id })]) : new Set());
    void this.loadPeople();
    this.dlg().nativeElement.showModal();
  }

  /**
   * The shop's people, fetched once per screen. A failure leaves the list empty rather than
   * closing the dialog: the party is still sendable, and the alternative is refusing a send
   * over a list the shopkeeper may not even want.
   */
  private async loadPeople(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loadingPeople.set(true);
    try {
      const recipients = await this.api.recipients(this.partyId());
      this.people.set(recipients.people);
      this.partyBlocked.set(recipients.partyBlocked);
      // The party is ticked before this answer arrives (see `ask`), so an opt-out has to
      // untick it — the alternative is a pre-ticked row that the send then refuses.
      if (recipients.partyBlocked) {
        this.picked.set(new Set());
      }
      this.loaded = true;
    } catch {
      this.people.set([]);
    } finally {
      this.loadingPeople.set(false);
    }
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

    const recipients = this.chosen();
    if (!recipients.length) {
      return;
    }

    this.state.set('sending');
    try {
      const partyId = this.partyId();
      if (partyId && this.partyPicked() && !this.hasNumber()) {
        await this.saveContact(partyId, this.typed());
      }
      const prepare = this.beforeCapture();
      if (prepare && !(await prepare())) {
        this.state.set('idle');
        return;
      }
      // Snapshot with every row rendered. A windowed table holds only what the viewport
      // needed (see shared/row-window.ts), and this clones the live DOM — so without
      // this the party would be sent a statement that stops wherever the shopkeeper
      // happened to have scrolled to, looking complete.
      const html = this.capture.around(() => printableHtml());
      const result = await this.api.share(
        recipients,
        html,
        this.filename(),
        this.action(),
        this.locale.locale(),
      );
      this.sentCount.set(result.sent);
      this.attempted.set(recipients.length);
      this.failedNames.set(result.failed);
      // Reaching nobody is a failure whatever the status said; reaching some of a list is
      // neither, and the label counts it out rather than claiming the whole thing went.
      this.state.set(result.sent === 0 ? 'error' : result.failed.length ? 'partial' : 'sent');
    } catch {
      this.state.set('error');
    }

    // Either way: a send spends a message, and a refusal means the count on hand was already
    // out of date. Deliberately not awaited — the button has said what happened and must not
    // wait on a second request to say it.
    void this.plan.refresh().catch(() => undefined);
  }

  /**
   * Writes the typed number onto the party, since the send reads the recipient off the party
   * and never off the request. Read-then-update rather than a patch: the update replaces every
   * field, so the party's own name and address have to be carried back untouched.
   */
  private async saveContact(partyId: string, contact: string): Promise<void> {
    const party = await this.parties.get(partyId);
    await this.parties.update(partyId, { name: party.name, contact, address: party.address });
    this.saved.set(contact);
  }

  /**
   * The name the recipients see on the attachment. A bill keeps its number, which survives
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
