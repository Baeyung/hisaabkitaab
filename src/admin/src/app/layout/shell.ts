import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminService } from '../core/admin/admin.service';
import { AuthStore } from '../core/auth/auth.store';

/** Sidebar plus outlet. One menu entry so far; the list is where the next ones go. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-dvh bg-slate-100">
      <aside class="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4">
        <h1 class="px-2 text-sm font-semibold tracking-wide text-slate-900 uppercase">
          HisaabKitaab admin
        </h1>

        <nav class="mt-6 flex-1 space-y-1">
          <a
            routerLink="/users"
            routerLinkActive="bg-slate-900 text-white"
            class="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            User access
          </a>
        </nav>

        <div class="border-t border-slate-200 pt-3">
          <p class="truncate px-3 text-xs text-slate-500">{{ store.email() }}</p>
          <button
            type="button"
            class="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            (click)="logout()"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main class="min-w-0 flex-1 p-8"><router-outlet /></main>
    </div>
  `,
})
export class Shell {
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);
  protected readonly store = inject(AuthStore);

  logout(): void {
    this.admin.logout();
    this.router.navigate(['/login']);
  }
}
