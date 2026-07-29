import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { AdminService, AdminUser } from '../../core/admin/admin.service';

/**
 * Pick a user, see who they are, lock or unlock them, and read every access change that was
 * ever made to the account. Locking bites immediately — the backend re-checks on every
 * request — so the button asks first.
 *
 * The picker is a list rather than a <select> because the state of every account is the whole
 * point of the screen, and a collapsed dropdown hides all of it but one row.
 */
@Component({
  selector: 'app-user-access',
  imports: [DatePipe],
  template: `
    <div class="space-y-7">
      <header class="max-w-xl">
        <h2 class="wide text-[26px] leading-tight font-bold text-ink">User access</h2>
        <p class="mt-2 text-[13.5px] leading-relaxed text-dim">
          Locking shuts an account out everywhere, immediately. Unlocking gives it back the same
          way. Nothing is deleted either way, and every change stays on the record.
        </p>
      </header>

      @if (error(); as message) {
        <p
          role="alert"
          class="rounded-md border-s-2 border-seal bg-seal/10 px-4 py-3 text-[13px] text-ink"
        >
          {{ message }}
        </p>
      }

      <div class="grid gap-6 lg:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)] lg:items-start">
        <!-- The register: every account, its state readable without opening it. -->
        <section class="overflow-hidden rounded-xl border border-rule bg-desk">
          <div class="flex items-baseline justify-between gap-3 px-4 pt-3.5">
            <h3 class="eyebrow">Register</h3>
            <p class="eyebrow">
              {{ users().length }}
              @if (lockedCount(); as locked) {
                <span class="text-seal"> · {{ locked }} locked</span>
              }
            </p>
          </div>
          <div class="border-b border-rule p-3">
            <label class="sr-only" for="filter">Filter accounts</label>
            <input
              id="filter"
              type="search"
              placeholder="Filter by name or number"
              class="w-full rounded-md border border-rule bg-vault px-3 py-2 text-[13px] text-ink transition-colors focus:border-pine"
              [value]="filter()"
              (input)="filter.set($any($event.target).value)"
            />
          </div>

          <ul class="ruled max-h-[32rem] overflow-y-auto">
            @for (user of visible(); track user.id) {
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 border-s-2 px-4 py-3 text-start transition-colors"
                  [class]="
                    user.id === selectedId()
                      ? 'border-s-pine bg-card'
                      : 'border-s-transparent hover:bg-card/60'
                  "
                  (click)="select(user.id)"
                >
                  <span
                    class="size-1.5 shrink-0 rounded-full"
                    [class]="user.disabled ? 'bg-seal' : 'bg-pine'"
                    aria-hidden="true"
                  ></span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[13.5px] font-medium text-ink">
                      {{ user.name }}
                    </span>
                    <span class="block font-mono text-[11.5px] text-faint">
                      {{ user.contactNumber }}
                    </span>
                  </span>
                  @if (user.disabled) {
                    <span class="eyebrow shrink-0 text-seal!">Locked</span>
                  }
                </button>
              </li>
            } @empty {
              <li class="px-4 py-8 text-center text-[13px] text-faint">
                No account matches “{{ filter() }}”.
              </li>
            }
          </ul>
        </section>

        @if (selected(); as user) {
          <section class="rounded-xl border border-rule bg-card">
            <div class="flex items-start justify-between gap-6 p-6">
              <div class="min-w-0">
                <h3 class="wide truncate text-[20px] font-bold text-ink">{{ user.name }}</h3>
                <p class="mt-1.5 font-mono text-[12.5px] text-dim">{{ user.contactNumber }}</p>
                <p class="truncate font-mono text-[12.5px] text-faint">
                  {{ user.email || 'no email on file' }}
                </p>
                <p class="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                  @if (user.admin) {
                    <span class="eyebrow text-pine!">Admin</span>
                  }
                  <span class="eyebrow" [class.text-brass!]="!user.verified">
                    {{ user.verified ? 'Verified' : 'Unverified' }}
                  </span>
                </p>
              </div>

              <!-- Two blocks, not one with a ternary: flipping state destroys one view and
                   creates the other, which is what re-runs the press animation. -->
              <div class="shrink-0 pt-2 pe-2">
                @if (user.disabled) {
                  <span class="stamp text-seal">Locked</span>
                } @else {
                  <span class="stamp text-pine">Active</span>
                }
              </div>
            </div>

            @if (user.admin) {
              <p class="border-t border-rule px-6 py-4 text-[13px] leading-relaxed text-dim">
                Admin accounts can't be locked here. Remove the address from
                <code class="font-mono text-[12px] text-ink">app.admin.emails</code> on the server
                instead.
              </p>
            } @else {
              <div class="space-y-3 border-t border-rule px-6 py-5">
                <div class="space-y-1.5">
                  <label class="eyebrow block" for="reason">Reason — optional, admins only</label>
                  <input
                    id="reason"
                    class="w-full max-w-sm rounded-md border border-rule bg-desk px-3 py-2 text-[13.5px] text-ink transition-colors focus:border-pine"
                    placeholder="e.g. non-payment"
                    [value]="reason()"
                    (input)="reason.set($any($event.target).value)"
                  />
                </div>

                <button
                  type="button"
                  class="rounded-md px-4 py-2 text-[13.5px] font-semibold text-vault transition-opacity hover:opacity-90 disabled:opacity-40"
                  [class]="user.disabled ? 'bg-pine' : 'bg-seal'"
                  [disabled]="saving()"
                  (click)="toggle(user)"
                >
                  {{ user.disabled ? 'Unlock account' : 'Lock account' }}
                </button>
              </div>
            }

            <div class="border-t border-rule px-6 py-5">
              <h4 class="eyebrow">Access history</h4>
              @if (user.history.length) {
                <!-- Date in the gutter, entry beside it: a register page, and the rule
                     between the columns is the one that makes it read as one. -->
                <ol class="ruled mt-3">
                  @for (event of user.history; track $index) {
                    <li class="flex gap-4 py-3">
                      <time
                        class="w-24 shrink-0 border-e border-rule pe-4 font-mono text-[11.5px] leading-5 text-faint"
                      >
                        {{ event.at | date: 'd MMM yy' }}<br />{{ event.at | date: 'h:mm a' }}
                      </time>
                      <div class="min-w-0">
                        <p class="text-[13.5px] text-ink">
                          <span [class]="event.disabled ? 'text-seal' : 'text-pine'">{{
                            event.disabled ? 'Locked' : 'Unlocked'
                          }}</span>
                          by {{ event.actor }}
                        </p>
                        @if (event.reason) {
                          <p class="mt-0.5 text-[13px] text-dim">{{ event.reason }}</p>
                        }
                      </div>
                    </li>
                  }
                </ol>
              } @else {
                <p class="mt-2 text-[13px] text-faint">
                  This account has never been locked or unlocked.
                </p>
              }
            </div>
          </section>
        } @else {
          <section
            class="grid place-items-center rounded-xl border border-dashed border-rule px-6 py-16 text-center"
          >
            <p class="max-w-[20rem] text-[13.5px] leading-relaxed text-faint">
              Pick an account from the register to see its state and everything that has ever been
              done to it.
            </p>
          </section>
        }
      </div>
    </div>
  `,
})
export class UserAccess {
  private readonly admin = inject(AdminService);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly selected = signal<AdminUser | null>(null);
  protected readonly filter = signal('');
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedId = computed(() => this.selected()?.id ?? '');
  protected readonly lockedCount = computed(() => this.users().filter((u) => u.disabled).length);

  protected readonly visible = computed(() => {
    const needle = this.filter().trim().toLowerCase();
    if (!needle) return this.users();
    return this.users().filter((u) =>
      `${u.name} ${u.contactNumber} ${u.email ?? ''}`.toLowerCase().includes(needle),
    );
  });

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
      // The register shows each user's lock state, so it goes stale on every change.
      await this.load();
    } catch {
      this.error.set("Couldn't change access. Please try again.");
    } finally {
      this.saving.set(false);
    }
  }
}
