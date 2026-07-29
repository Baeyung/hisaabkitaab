import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminService } from '../core/admin/admin.service';
import { AuthStore } from '../core/auth/auth.store';

/**
 * Nameplate, tabs, outlet. A 240px sidebar holding one link was mostly empty
 * furniture; a bar gives the register its full width and takes the next tab
 * without a redesign.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-dvh bg-vault">
      <header class="border-b border-rule">
        <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
          <div class="flex items-baseline gap-3">
            <span class="wide text-[15px] font-bold text-ink">HisaabKitaab</span>
            <span class="eyebrow text-pine!">Back office</span>
          </div>

          <nav class="flex gap-1">
            <a
              routerLink="/users"
              routerLinkActive="text-ink! border-pine!"
              class="border-b-2 border-transparent px-1 pb-1 text-[13.5px] font-medium text-dim transition-colors hover:text-ink"
            >
              User access
            </a>
          </nav>

          <div class="ms-auto flex items-center gap-4">
            <span class="hidden font-mono text-[12px] text-faint sm:inline">{{
              store.email()
            }}</span>
            <button
              type="button"
              class="rounded-md border border-rule px-3 py-1.5 text-[12.5px] font-medium text-dim transition-colors hover:border-faint hover:text-ink"
              (click)="logout()"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <!-- The register plus one detail column is the widest thing here; past ~1000px the
           detail card is mostly margin. -->
      <main class="mx-auto max-w-5xl px-6 py-10"><router-outlet /></main>
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
