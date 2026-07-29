import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminService } from '../../core/admin/admin.service';

/**
 * The only door in. Credentials are an ordinary HisaabKitaab account's — admin rights come
 * from the backend's email allowlist, so "right password, wrong person" is a real and
 * distinct outcome here (403) and is worth its own message.
 */
@Component({
  selector: 'app-login',
  template: `
    <main class="grid min-h-dvh place-items-center bg-vault p-6">
      <div class="w-full max-w-sm">
        <div class="mb-7">
          <p class="eyebrow">HisaabKitaab</p>
          <h1 class="wide mt-1.5 text-[30px] leading-none font-bold text-ink">Back office</h1>
          <p class="mt-3 text-[13.5px] leading-relaxed text-dim">
            Sign in with your HisaabKitaab account. Admin rights come from the server's allowlist,
            not from this screen.
          </p>
        </div>

        <form
          class="space-y-4 rounded-xl border border-rule bg-card p-6"
          (submit)="$event.preventDefault(); submit()"
        >
          <div class="space-y-1.5">
            <label class="eyebrow block" for="identifier">Email or mobile number</label>
            <input
              id="identifier"
              class="w-full rounded-md border border-rule bg-desk px-3 py-2 text-[14px] text-ink transition-colors focus:border-pine"
              autocomplete="username"
              [value]="identifier()"
              (input)="identifier.set($any($event.target).value)"
            />
          </div>

          <div class="space-y-1.5">
            <label class="eyebrow block" for="password">Password</label>
            <input
              id="password"
              type="password"
              class="w-full rounded-md border border-rule bg-desk px-3 py-2 text-[14px] text-ink transition-colors focus:border-pine"
              autocomplete="current-password"
              [value]="password()"
              (input)="password.set($any($event.target).value)"
            />
          </div>

          @if (error()) {
            <p
              role="alert"
              class="rounded-md border-s-2 border-seal bg-seal/10 px-3 py-2 text-[13px] text-ink"
            >
              {{ error() }}
            </p>
          }

          <button
            type="submit"
            class="w-full rounded-md bg-pine px-4 py-2.5 text-[14px] font-semibold text-vault transition-colors hover:opacity-90 disabled:bg-rule disabled:text-faint"
            [disabled]="submitting() || !identifier() || !password()"
          >
            {{ submitting() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </div>
    </main>
  `,
})
export class Login {
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);

  protected readonly identifier = signal('');
  protected readonly password = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.admin.login(this.identifier().trim(), this.password());
      this.router.navigate(['/users']);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const code = (err as { error?: { error?: string } }).error?.error;
      this.error.set(
        status === 403
          ? "Those credentials are right, but the account isn't an admin."
          : code === 'ACCOUNT_LOCKED'
            ? 'Locked after too many wrong passwords. Reset the password in the main app.'
            : code === 'ACCOUNT_DISABLED'
              ? 'That account is suspended.'
              : status === 401
                ? "That email or number and password don't match."
                : 'Something went wrong. Please try again.',
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
