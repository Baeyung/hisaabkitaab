import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { AdminService, AdminUser } from '../../core/admin/admin.service';

/**
 * Pick a user, see who they are, lock or unlock them, and read every access change that was
 * ever made to the account. Locking bites immediately — the backend re-checks on every
 * request — so the button asks first.
 */
@Component({
  selector: 'app-user-access',
  imports: [DatePipe],
  template: `
    <div class="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 class="text-2xl font-semibold text-slate-900">User access</h2>
        <p class="mt-1 text-sm text-slate-500">
          Lock an account to shut it out everywhere, immediately. Unlocking gives it straight
          back — nothing is deleted either way.
        </p>
      </div>

      <div class="space-y-1">
        <label class="block text-sm font-medium text-slate-700" for="user">User</label>
        <select
          id="user"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
          [value]="selectedId()"
          (change)="select($any($event.target).value)"
        >
          <option value="">Select a user…</option>
          @for (user of users(); track user.id) {
            <option [value]="user.id">
              {{ user.name }} — {{ user.contactNumber }}{{ user.disabled ? ' (locked)' : '' }}
            </option>
          }
        </select>
      </div>

      @if (error(); as message) {
        <p role="alert" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ message }}</p>
      }

      @if (selected(); as user) {
        <section class="space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold text-slate-900">{{ user.name }}</h3>
              <p class="text-sm text-slate-500">{{ user.email || 'no email' }}</p>
              <p class="text-sm text-slate-500">{{ user.contactNumber }}</p>
            </div>
            <div class="flex shrink-0 flex-wrap justify-end gap-2">
              @if (user.admin) {
                <span class="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                  admin
                </span>
              }
              <span
                class="rounded-full px-3 py-1 text-xs font-medium"
                [class]="
                  user.verified ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'
                "
              >
                {{ user.verified ? 'verified' : 'unverified' }}
              </span>
              <span
                class="rounded-full px-3 py-1 text-xs font-medium"
                [class]="user.disabled ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'"
              >
                {{ user.disabled ? 'locked' : 'active' }}
              </span>
            </div>
          </div>

          @if (user.admin) {
            <p class="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Admin accounts can't be locked — that's set in the server's configuration, not here.
            </p>
          } @else {
            <div class="space-y-3 border-t border-slate-200 pt-5">
              <div class="space-y-1">
                <label class="block text-sm font-medium text-slate-700" for="reason">
                  Reason <span class="font-normal text-slate-400">(optional, admin-only)</span>
                </label>
                <input
                  id="reason"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  placeholder="e.g. non-payment"
                  [value]="reason()"
                  (input)="reason.set($any($event.target).value)"
                />
              </div>

              <button
                type="button"
                class="rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50"
                [class]="user.disabled ? 'bg-emerald-600' : 'bg-red-600'"
                [disabled]="saving()"
                (click)="toggle(user)"
              >
                {{ user.disabled ? 'Unlock account' : 'Lock account' }}
              </button>
            </div>
          }

          <div class="border-t border-slate-200 pt-5">
            <h4 class="text-sm font-semibold text-slate-900">Access history</h4>
            @if (user.history.length) {
              <ul class="mt-3 space-y-3">
                @for (event of user.history; track $index) {
                  <li class="flex gap-3 text-sm">
                    <span
                      class="mt-1.5 size-2 shrink-0 rounded-full"
                      [class]="event.disabled ? 'bg-red-500' : 'bg-emerald-500'"
                    ></span>
                    <div class="min-w-0">
                      <p class="text-slate-900">
                        {{ event.disabled ? 'Locked' : 'Unlocked' }} by {{ event.actor }}
                      </p>
                      <p class="text-slate-500">
                        {{ event.at | date: 'd MMM y, h:mm a' }}{{ event.reason ? ' — ' : ''
                        }}{{ event.reason }}
                      </p>
                    </div>
                  </li>
                }
              </ul>
            } @else {
              <p class="mt-2 text-sm text-slate-500">
                This account has never been locked or unlocked.
              </p>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class UserAccess {
  private readonly admin = inject(AdminService);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly selected = signal<AdminUser | null>(null);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedId = computed(() => this.selected()?.id ?? '');

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    try {
      this.users.set(await this.admin.users());
    } catch {
      this.error.set("Couldn't load users. Please try again.");
    }
  }

  async select(id: string): Promise<void> {
    this.error.set(null);
    this.reason.set('');
    if (!id) {
      this.selected.set(null);
      return;
    }
    try {
      // The list carries no history, so the picked user is re-fetched in full.
      this.selected.set(await this.admin.detail(id));
    } catch {
      this.error.set("Couldn't load that user. Please try again.");
    }
  }

  async toggle(user: AdminUser): Promise<void> {
    const locking = !user.disabled;
    const question = locking
      ? `Lock ${user.name}? They will be signed out of every device immediately.`
      : `Unlock ${user.name}? They get full access back straight away.`;
    if (this.saving() || !confirm(question)) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const updated = await this.admin.setAccess(user.id, locking, this.reason());
      this.selected.set(updated);
      this.reason.set('');
      // The picker shows each user's lock state, so it goes stale on every change.
      await this.load();
    } catch {
      this.error.set("Couldn't change access. Please try again.");
    } finally {
      this.saving.set(false);
    }
  }
}
