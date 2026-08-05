import { Component, inject, signal } from '@angular/core';
import { email as emailRule, form, FormField, pattern, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { MemberService } from '../../core/store/member.service';
import { GrantableRole, InviteDraft, Member } from '../../core/store/member.models';

const EMPTY_INVITE: InviteDraft = { email: '', role: 'EDITOR' };

/**
 * Store Settings › Manage Users — who else may work in this shop.
 *
 * Access is given against an email address whether or not anyone has signed up with it:
 * an unknown address is mailed an invite and shows here as pending until they join. What
 * a shared user may do is the role on their row, changeable in place; taking access away
 * removes the row and nothing else — their own account, and any shop of their own, are
 * untouched.
 *
 * Owner-only, behind `ownerGuard`: this is a screen about the shop, not in it.
 */
@Component({
  selector: 'app-users',
  imports: [FormField],
  templateUrl: './users.html',
  styleUrls: ['./settings-table.css', './users.css'],
})
export class SettingsUsers {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(MemberService);

  protected readonly members = signal<Member[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

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
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.members.set(await this.api.list());
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
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
    return status === 400 ? 'members.error.self' : 'error.generic';
  }
}
