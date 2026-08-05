import { StoreRole } from './store.models';

/** Roles an owner can hand out. Ownership is not one of them — a shop has exactly one owner. */
export type GrantableRole = Extract<StoreRole, 'VIEWER' | 'EDITOR'>;

/**
 * Someone the owner has given access to. `INVITED` means the address has no account yet:
 * the shop is waiting for them, and signing up on that address claims it.
 */
export interface Member {
  userId: string;
  /** Null while the invite is outstanding — there is no real account behind it yet. */
  name: string | null;
  email: string;
  role: GrantableRole;
  status: 'INVITED' | 'ACTIVE';
}

export interface InviteDraft {
  email: string;
  role: GrantableRole;
}
