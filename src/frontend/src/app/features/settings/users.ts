import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { email as emailRule, form, FormField, pattern, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { AuthService } from '../../core/auth/auth.service';
import { AuthStore } from '../../core/auth/auth.store';
import { MemberService } from '../../core/store/member.service';
import { StoreService } from '../../core/store/store.service';
import { PlanService } from '../../core/plan/plan.service';
import { GrantableRole, InviteDraft, Member } from '../../core/store/member.models';
import { PHONE_PATTERN } from '../../shared/digits-only';
import { dialOf, PhoneField } from '../../shared/phone-field/phone-field';

const EMPTY_INVITE: InviteDraft = { email: '', role: 'EDITOR' };

/**
 * Store Settings › Manage Users — two screens in one, split by who is looking.
 *
 * Everyone gets the account block at the top: their own name and contact number, theirs
 * alone to change. Nobody edits anybody else here, not even the owner — the backend takes
 * the account from the credentials, so the block is self-service by construction. The email
 * is shown but fixed: it is what the account verified against and where a password reset is
 * mailed.
 *
 * The owner also gets the list below it — who else may work in this shop. Access is given
 * against an email address whether or not anyone has signed up with it: an unknown address
 * is mailed an invite and shows as pending until they join. What a shared user may do is the
 * role on their row, changeable in place; taking access away removes the row and nothing
 * else — their own account, and any shop of their own, are untouched.
 *
 * Open to every role for the sake of the account block (the route's `ownerGuard` had to go),
 * so everything below it is gated on {@link isOwner} instead — including the member fetch,
 * which the backend refuses for anyone else.
 */
@Component({
  selector: 'app-users',
  imports: [FormField, PhoneField],
  templateUrl: './users.html',
  styleUrls: ['./settings-table.css', './users.css'],
})
export class SettingsUsers {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(MemberService);
  private readonly plan = inject(PlanService);
  private readonly auth = inject(AuthService);
  private readonly stores = inject(StoreService);

  protected readonly isOwner = this.stores.isOwner;
  protected readonly me = inject(AuthStore).currentUser;

  protected readonly account = signal({ name: '', contactNumber: '' });
  protected readonly accountForm = form(this.account, (path) => {
    required(path.name);
    required(path.contactNumber);
    // Same pair as signup — the field strips non-digits as they are typed, this keeps
    // the length in step with the backend @Pattern.
    pattern(path.contactNumber, PHONE_PATTERN);
  });
  protected readonly savingAccount = signal(false);
  protected readonly accountErrorKey = signal<TranslationKey | null>(null);

  /**
   * Your own details are read on nearly every visit and changed almost never, so the card
   * shows them and keeps the fields behind the pencil — the same way a row on Items or
   * Parties is read until someone asks to edit it.
   */
  protected readonly editing = signal(false);
  protected readonly accountSaved = signal(false);
  /** What to put back if the edit is abandoned — the form writes straight into `account`. */
  private beforeEdit: { name: string; contactNumber: string } | null = null;

  /** Two letters standing in for a photo there is nowhere to upload. */
  protected readonly initials = computed(
    () =>
      this.account()
        .name.trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join('') || '·',
  );

  /** Stored run-together ("923001234567"); split back out to read as a number. */
  protected readonly contactDisplay = computed(() => {
    const value = this.account().contactNumber;
    const dial = dialOf(value);
    return dial ? `+${dial} ${value.slice(dial.length)}` : value;
  });

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('acctName');

  /**
   * Whether one more *new* person would be refused. The count is the owner's across every shop
   * they own, not this shop's row count — the same seat is spent once however many shops a
   * person is in, so this screen cannot work it out from the list it is showing.
   */
  protected readonly atUserLimit = this.plan.atUserLimit;

  protected readonly members = signal<Member[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  /** Whether the shop's people belong on screen at all — the owner's half of it. */
  protected readonly showPeople = computed(
    () => this.isOwner() && !this.loading() && !this.loadError(),
  );

  protected readonly inviting = signal(false);
  protected readonly saving = signal(false);
  /** Which row is being asked about before its access is removed. */
  protected readonly confirmingId = signal<string | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly draft = signal<InviteDraft>({ ...EMPTY_INVITE });
  protected readonly inviteForm = form(this.draft, (path) => {
    required(path.email);
    emailRule(path.email);
    // Same pair as signup: email() accepts "user@localhost", and the backend demands a TLD.
    pattern(path.email, /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/);
  });

  constructor() {
    this.load();
    // The pencil is replaced by the form it opens, so the keyboard has to follow it there.
    effect(() => this.nameInput()?.nativeElement.focus());
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      // The account is re-read rather than taken from the session: nothing but the credentials
      // survives a page reload. The list is owner-only — the backend 403s anyone else — and the
      // plan only decides whether the invite is offered, so failing to read it must not fail the
      // screen; fall back to offering it and letting the server answer.
      const [user, members] = await Promise.all([
        this.auth.me(),
        this.isOwner() ? this.api.list() : Promise.resolve(null),
        this.plan.refresh().catch(() => null),
      ]);
      this.account.set({ name: user.name, contactNumber: user.contactNumber });
      this.editing.set(false);
      this.accountSaved.set(false);
      this.members.set(members);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  startEditAccount(): void {
    this.beforeEdit = this.account();
    this.accountErrorKey.set(null);
    this.accountSaved.set(false);
    this.editing.set(true);
  }

  cancelEditAccount(): void {
    if (this.beforeEdit) {
      this.account.set(this.beforeEdit);
    }
    this.accountErrorKey.set(null);
    this.editing.set(false);
  }

  async saveAccount(): Promise<void> {
    if (this.accountForm().invalid()) {
      return;
    }
    this.savingAccount.set(true);
    this.accountErrorKey.set(null);
    try {
      const saved = { ...this.account(), name: this.account().name.trim() };
      await this.auth.updateProfile(saved);
      this.account.set(saved);
      this.editing.set(false);
      this.accountSaved.set(true);
    } catch (err) {
      // The one the user can act on is a number that is already someone else's login.
      const status = (err as { status?: number } | null)?.status;
      this.accountErrorKey.set(status === 409 ? 'settings.users.account.duplicate' : 'error.generic');
    } finally {
      this.savingAccount.set(false);
    }
  }

  startInvite(): void {
    this.confirmingId.set(null);
    this.errorKey.set(null);
    this.draft.set({ ...EMPTY_INVITE });
    this.inviting.set(true);
  }

  cancelInvite(): void {
    this.inviting.set(false);
    this.errorKey.set(null);
  }

  protected setDraftRole(role: GrantableRole): void {
    this.draft.update((d) => ({ ...d, role }));
  }

  async invite(): Promise<void> {
    if (this.inviteForm().invalid()) {
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    try {
      const member = await this.api.invite({
        email: this.draft().email.trim(),
        role: this.draft().role,
      });
      this.members.update((list) => [...(list ?? []), member]);
      this.inviting.set(false);
      // A seat may have just been spent — re-read rather than counting locally, since whether
      // it was depends on shops this screen cannot see.
      void this.plan.refresh().catch(() => null);
    } catch (err) {
      // The two the owner can act on are worth naming: their own address, and one
      // that is already on the list. Anything else is the generic failure.
      this.errorKey.set(this.inviteErrorKey(err));
    } finally {
      this.saving.set(false);
    }
  }

  async changeRole(member: Member, role: GrantableRole): Promise<void> {
    if (role === member.role) {
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    try {
      const updated = await this.api.changeRole(member.userId, role);
      this.members.update((list) => (list ?? []).map((m) => (m.userId === member.userId ? updated : m)));
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  askRemove(userId: string): void {
    this.errorKey.set(null);
    this.confirmingId.set(userId);
  }

  cancelRemove(): void {
    this.confirmingId.set(null);
  }

  async confirmRemove(userId: string): Promise<void> {
    this.saving.set(true);
    this.errorKey.set(null);
    try {
      await this.api.remove(userId);
      this.members.update((list) => (list ?? []).filter((m) => m.userId !== userId));
      this.confirmingId.set(null);
      // Frees a seat only if that was their last shop here, which is the server's to decide.
      void this.plan.refresh().catch(() => null);
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  /** What a row shows in place of a name while the invite is still outstanding. */
  protected displayName(member: Member): string {
    return member.name ?? this.locale.t('members.pending');
  }

  private inviteErrorKey(err: unknown): TranslationKey {
    const status = (err as { status?: number } | null)?.status;
    if (status === 409) {
      return 'members.error.duplicate';
    }
    if (status === 400) {
      return 'members.error.self';
    }
    // Only the owner reaches this screen at all, so a 403 here is the plan's user ceiling
    // rather than an access refusal — nothing else on this call can produce one.
    return status === 403 ? 'members.error.planLimit' : 'error.generic';
  }
}
