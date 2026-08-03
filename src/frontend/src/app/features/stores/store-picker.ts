import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { AuthService } from '../../core/auth/auth.service';
import { StoreService } from '../../core/store/store.service';
import { Store, StoreDraft } from '../../core/store/store.models';
import { BrandMark } from '../../shared/brand-mark/brand-mark';
import { DigitsOnly } from '../../shared/digits-only';
import { LanguageToggle } from '../../shared/language-toggle/language-toggle';

/** A new shop starts with the essentials; logo, watermark and drawer live in Settings › General. */
const EMPTY_DRAFT: StoreDraft = { name: '', address: '', contact: '', logoUri: '', watermarkUri: '' };

/**
 * The first screen after signing in: every shop the user owns, on one page.
 *
 * Picking one enters it at `/s/:storeId/…`, which is what scopes the rest of the
 * app — so this is also the way *between* shops, not just into the first one. It
 * always shows, even with a single store, so "which books am I in?" is answered
 * before any number is on screen rather than inferred from a name in the corner.
 * With no stores yet the same page is the onboarding: the create form, open.
 */
@Component({
  selector: 'app-store-picker',
  imports: [FormField, DigitsOnly, BrandMark, LanguageToggle],
  templateUrl: './store-picker.html',
  styleUrl: './store-picker.css',
})
export class StorePicker {
  protected readonly locale = inject(LocaleService);
  private readonly auth = inject(AuthService);
  private readonly stores = inject(StoreService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly createError = signal(false);

  protected readonly list = signal<Store[]>([]);

  /** Open by default when there is nothing to pick — the empty state *is* the form. */
  protected readonly creating = signal(false);

  protected readonly model = signal<StoreDraft>({ ...EMPTY_DRAFT });
  protected readonly storeForm = form(this.model, (path) => {
    required(path.name);
  });

  /** First letter of the typed name, so the new shop's mark fills in as it's named. */
  protected readonly initial = computed(() => this.model().name.trim().charAt(0).toUpperCase());

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const stores = await this.stores.list();
      this.list.set(stores);
      this.creating.set(stores.length === 0);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Enter a store. Everything downstream reads the id back out of the URL. */
  open(store: Store): void {
    void this.router.navigate(['/s', store.id, 'dashboard']);
  }

  /** The mark shown on a card: the store's logo, else the first letter of its name. */
  markOf(store: Store): string {
    return (store.name ?? '').trim().charAt(0).toUpperCase();
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  startCreating(): void {
    this.model.set({ ...EMPTY_DRAFT });
    this.createError.set(false);
    this.creating.set(true);
  }

  cancelCreating(): void {
    this.creating.set(false);
  }

  async submit(): Promise<void> {
    if (this.storeForm().invalid() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.createError.set(false);
    try {
      // Straight into the new shop: creating one is only ever a step towards using it.
      const created = await this.stores.create(this.model());
      this.open(created);
    } catch {
      this.createError.set(true);
    } finally {
      this.saving.set(false);
    }
  }
}
