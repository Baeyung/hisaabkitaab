import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StoreService } from './store.service';
import { GrantableRole, InviteDraft, Member } from './member.models';

/**
 * Who else may work in the current shop. Owner-only on the backend, so every call here
 * fails for anyone else — the Manage Users screen is behind `ownerGuard` for that reason.
 */
@Injectable({ providedIn: 'root' })
export class MemberService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  list(): Promise<Member[]> {
    return firstValueFrom(this.http.get<Member[]>(this.stores.api('members')));
  }

  /** Grants access. An address with no account yet is mailed an invite to sign up. */
  invite(draft: InviteDraft): Promise<Member> {
    return firstValueFrom(this.http.post<Member>(this.stores.api('members'), draft));
  }

  changeRole(userId: string, role: GrantableRole): Promise<Member> {
    return firstValueFrom(this.http.put<Member>(this.stores.api(`members/${userId}`), { role }));
  }

  /** Takes access away. Their own account is untouched — only this shop's grant goes. */
  remove(userId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.stores.api(`members/${userId}`)));
  }
}
