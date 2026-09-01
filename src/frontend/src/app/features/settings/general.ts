import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { disabled, form, FormField, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { StoreDraft } from '../../core/store/store.models';
import { toDigits } from '../../shared/digits-only';
import { PhoneField } from '../../shared/phone-field/phone-field';
import { readImageFile } from '../../shared/image-file';
import { ToastService } from '../../shared/toast/toast.service';

const EMPTY_DRAFT: StoreDraft = { name: '', address: '', contact: '', logoUri: '', watermarkUri: '' };

type ImageField = 'logoUri' | 'watermarkUri';

/**
 * Store Settings › General — edits the shop the user is currently in. Creating one
 * belongs to the store picker (`/stores`), which is where a user with several shops
 * chooses between them, so this screen only ever edits; the store is guaranteed to
 * exist by storeGuard. Logo/watermark are read as base64 data URIs — see the
 * object-storage ticket referenced above.
 */
@Component({
  selector: 'app-general',
  imports: [FormField, PhoneField, RouterLink],
  templateUrl: './general.html',
  // The switch is shared with Store Settings › Menu rather than drawn twice.
  styleUrls: ['./general.css', './settings-switch.css'],
})
export class SettingsGeneral {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly deleteDialog = viewChild<ElementRef<HTMLDialogElement>>('deleteDialog');

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly imageErrorKey = signal<TranslationKey | null>(null);

  /** Opening drawer balance — cash on hand at onboarding. null = field empty (clears it). */
  protected readonly openingCash = signal<number | null>(null);

  /**
   * Navigate from the board instead of the sidebar. Owner-only and shop-wide, like the rest
   * of the arrangement — it is the counter tablet everyone shares that this is for, so it
   * would be the wrong thing to set per person.
   *
   * It rides on this screen's Save rather than switching the moment it is flipped: the change
   * takes the sidebar away, and doing that under someone mid-sentence in the name field would
   * be a surprise. The board's own settings tile is how a shop gets back here to turn it off.
   */
  protected readonly easyMode = signal(false);

  /**
    * A shared user reaches this screen for the opening drawer balance, which is theirs to
    * set — the shop's own details and branding are not. The fields are shown rather than
    * hidden so they can still read what the shop is called; they just cannot move them.
    */
  protected readonly isOwner = this.stores.isOwner;

  protected readonly model = signal<StoreDraft>({ ...EMPTY_DRAFT });
  protected readonly storeForm = form(this.model, (path) => {
    required(path.name);
    disabled(path.name, () => !this.stores.isOwner());
    disabled(path.address, () => !this.stores.isOwner());
    disabled(path.contact, () => !this.stores.isOwner());
  });

  /** First letter of the typed name — keeps the nameplate mark in step as it's edited. */
  protected readonly initial = computed(() => this.model().name.trim().charAt(0).toUpperCase());

  // ── deleting the shop ───────────────────────────────────────────────
  protected readonly confirmingDelete = signal(false);
  protected readonly typedName = signal('');
  protected readonly deleting = signal(false);

  /** The saved name, not the edited one — an unsaved rename must not move the target. */
  protected readonly storeName = computed(() => this.stores.current()?.name ?? '');

  /**
   * Deleting erases the shop's whole history, so the name is typed out exactly —
   * no trimming, no case folding. Nothing to match against means nothing to delete.
   */
  protected readonly canDelete = computed(
    () => this.storeName().length > 0 && this.typedName() === this.storeName(),
  );

  protected readonly mediaFields: ReadonlyArray<{ field: ImageField; label: TranslationKey }> = [
    { field: 'logoUri', label: 'settings.general.logo' },
    { field: 'watermarkUri', label: 'settings.general.watermark' },
  ];

  constructor() {
    this.load();
    // A native <dialog> so focus-trap, Escape and the backdrop come for free.
    // Both signals are read before the guard: the query resolves a tick after the
    // first run, and an early return that skipped them would never re-run.
    effect(() => {
      const el = this.deleteDialog()?.nativeElement;
      const wanted = this.confirmingDelete();
      if (!el) {
        return;
      }
      if (wanted) {
        if (!el.open) {
          el.showModal();
        }
      } else if (el.open) {
        el.close();
      }
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const store = this.stores.current();
      if (!store) {
        this.loadError.set(true);
        return;
      }
      const cash = await this.stores.getOpeningCash();
      this.openingCash.set(cash > 0 ? cash : null);
      this.easyMode.set(store.settings?.easyMode === true);
      // Backend nullable columns can arrive as null; forms want strings.
      this.model.set({
        name: store.name ?? '',
        address: store.address ?? '',
        // Pre-digits-only rows may hold punctuation; strip so an untouched
        // contact field can't fail validation on save.
        contact: toDigits(store.contact),
        logoUri: store.logoUri ?? '',
        watermarkUri: store.watermarkUri ?? '',
      });
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.storeForm().invalid()) {
      return;
    }
    const store = this.stores.current();
    if (!store) {
      return;
    }
    this.saving.set(true);
    try {
      // A shared user's save carries only the drawer balance — the store fields are
      // disabled for them, and the backend would refuse the update anyway.
      if (this.isOwner()) {
        await this.stores.update(store.id, this.model());
        await this.saveEasyMode();
      }
      await this.stores.setOpeningCash(this.openingCash() ?? 0);
      this.toast.success(this.locale.t('settings.general.saved'));
    } catch {
      this.toast.error(this.locale.t('error.generic'));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * How the shop navigates, on its own endpoint — the arrangement is one document and this is
   * a field in it, so the rest of it is read back and sent along unchanged. Skipped entirely
   * when nothing moved, which is most saves of this screen: the settings endpoint is
   * owner-only and replaces the whole arrangement, and there is no reason to rewrite a shop's
   * menu because somebody corrected a phone number.
   *
   * Read *after* the store update above, not before: that call replaces the cached store, and
   * a document captured ahead of it would be the one from before the response landed.
   */
  private async saveEasyMode(): Promise<void> {
    const settings = this.stores.current()?.settings;
    if (!settings || (settings.easyMode === true) === this.easyMode()) {
      return;
    }
    await this.stores.updateSettings({ ...settings, easyMode: this.easyMode() });
  }

  async onFile(event: Event, field: ImageField): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // let the user re-pick the same file after a rejection
    if (!file) {
      return;
    }
    const result = await readImageFile(file);
    this.imageErrorKey.set(result.error ?? null);
    if (result.uri) {
      this.model.update((m) => ({ ...m, [field]: result.uri }));
    }
  }

  removeImage(field: ImageField): void {
    this.imageErrorKey.set(null);
    this.model.update((m) => ({ ...m, [field]: '' }));
  }

  openDelete(): void {
    this.typedName.set('');
    this.confirmingDelete.set(true);
  }

  async confirmDelete(): Promise<void> {
    const store = this.stores.current();
    // Re-checked here, not just on the button: the dialog can be submitted by Enter.
    if (!store || !this.canDelete() || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    try {
      await this.stores.delete(store.id);
      this.toast.success(this.locale.t('toast.deleted', { label: this.storeName() }));
      // Out of the store route before anything re-reads the store that no longer
      // exists. If that was the user's last shop the picker sends them to setup.
      await this.router.navigate(['/stores']);
    } catch {
      this.toast.error(this.locale.t('error.generic'));
      this.deleting.set(false);
    }
  }
}
