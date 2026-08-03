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
    <main class="grid min-h-dvh place-items-center bg-slate-100 p-6">
      <form
        class="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200"
        (submit)="$event.preventDefault(); submit()"
      >
        <div>
          <h1 class="text-xl font-semibold text-slate-900">HisaabKitaab admin</h1>
          <p class="mt-1 text-sm text-slate-500">Sign in with your admin account.</p>
        </div>

        <div class="space-y-1">
          <label class="block text-sm font-medium text-slate-700" for="identifier">
            Email or mobile number
          </label>
          <input
            id="identifier"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none"
            autocomplete="username"
            [value]="identifier()"
            (input)="identifier.set($any($event.target).value)"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-sm font-medium text-slate-700" for="password">Password</label>
          <input
            id="password"
            type="password"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none"
            autocomplete="current-password"
            [value]="password()"
            (input)="password.set($any($event.target).value)"
          />
        </div>

        @if (error()) {
          <p role="alert" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {{ error() }}
          </p>
        }

        <button
          type="submit"
          class="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          [disabled]="submitting() || !identifier() || !password()"
        >
          {{ submitting() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
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
          ? 'That account is not an admin.'
          : code === 'ACCOUNT_LOCKED'
            ? 'Account locked after too many wrong passwords. Reset it in the main app.'
            : code === 'ACCOUNT_DISABLED'
              ? 'That account is suspended.'
              : status === 401
                ? 'Invalid credentials.'
                : 'Something went wrong. Please try again.',
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
