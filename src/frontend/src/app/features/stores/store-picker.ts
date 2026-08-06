import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { AuthService } from '../../core/auth/auth.service';
import { StoreService } from '../../core/store/store.service';
import { PlanService } from '../../core/plan/plan.service';
import { Store } from '../../core/store/store.models';
import { OuterBar } from '../../shared/outer-bar/outer-bar';

/**
 * The first screen after signing in: every shop the user owns, on one page.
 *
 * Picking one enters it at `/s/:storeId/…`, which is what scopes the rest of the
 * app — so this is also the way *between* shops, not just into the first one. It
 * always shows, even with a single store, so "which books am I in?" is answered
 * before any number is on screen rather than inferred from a name in the corner.
 *
 * Adding a shop is not done here: it opens the guided setup at `/stores/new`,
 * which takes the branding and opening balances too. With no stores yet there is
 * nothing to pick, so the user goes straight there.
 */
@Component({
  selector: 'app-store-picker',
  imports: [RouterLink, OuterBar, NgTemplateOutlet],
  templateUrl: './store-picker.html',
  styleUrl: './store-picker.css',
})
export class StorePicker {
  protected readonly locale = inject(LocaleService);
  private readonly auth = inject(AuthService);
  private readonly stores = inject(StoreService);
  private readonly router = inject(Router);

  protected readonly plan = inject(PlanService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  /**
   * Whether "Add a shop" would be refused. The plan is fetched alongside the list rather than
   * guessed from `owned().length`: the ceiling may be an override set for this account alone,
   * and only the server knows it.
   */
  protected readonly atStoreLimit = this.plan.atStoreLimit;

  protected readonly list = signal<Store[]>([]);

  /**
   * Own shops and shared ones are shown as two sections rather than one mixed list: what a
   * user may do differs between them, so which is which has to be answered before they pick,
   * not discovered when a button is missing.
   */
  protected readonly owned = computed(() => this.list().filter((s) => s.role === 'OWNER'));
  protected readonly shared = computed(() => this.list().filter((s) => s.role !== 'OWNER'));

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      // The plan only decides whether one button is offered, so a failure to read it must not
      // fail the screen — fall back to offering it and letting the server answer.
      const [stores] = await Promise.all([
        this.stores.list(),
        this.plan.refresh().catch(() => null),
      ]);
      this.list.set(stores);
      if (stores.length === 0) {
        // Nothing to pick — the first shop is opened in the guided setup. Return
        // with `loading` still true so the skeleton holds the screen rather than
        // flashing an empty "Your shops" while the route changes, and replaceUrl
        // so Back out of setup doesn't bounce off that empty picker.
        void this.router.navigate(['/stores/new'], { replaceUrl: true });
        return;
      }
    } catch {
      this.loadError.set(true);
    }
    this.loading.set(false);
  }

  /** Enter a store. Everything downstream reads the id back out of the URL. */
  open(store: Store): void {
    void this.router.navigate(['/s', store.id, 'dashboard']);
  }

  /** The mark shown on a card: the store's logo, else the first letter of its name. */
  markOf(store: Store): string {
    return (store.name ?? '').trim().charAt(0).toUpperCase();
  }

  /** What a shared card says the user may do there. */
  roleKey(store: Store): TranslationKey {
    return store.role === 'EDITOR' ? 'members.role.editor' : 'members.role.viewer';
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
