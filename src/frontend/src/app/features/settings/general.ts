import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { StoreDraft } from '../../core/store/store.models';
import { DigitsOnly, toDigits } from '../../shared/digits-only';

// ponytail: base64-image-in-DB stopgap — this cap keeps a store row and every
// GET /api/stores payload sane until bucket upload lands (docs/tickets/HK-store-media-object-storage.md).
const MAX_IMAGE_BYTES = 300 * 1024;
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
  imports: [FormField, DigitsOnly, RouterLink],
  templateUrl: './general.html',
  styleUrl: './general.css',
})
export class SettingsGeneral {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly savedKey = signal<TranslationKey | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly imageErrorKey = signal<TranslationKey | null>(null);

  /** Opening drawer balance — cash on hand at onboarding. null = field empty (clears it). */
  protected readonly openingCash = signal<number | null>(null);

  protected readonly model = signal<StoreDraft>({ ...EMPTY_DRAFT });
  protected readonly storeForm = form(this.model, (path) => {
    required(path.name);
  });

  /** First letter of the typed name — keeps the nameplate mark in step as it's edited. */
  protected readonly initial = computed(() => this.model().name.trim().charAt(0).toUpperCase());

  protected readonly mediaFields: ReadonlyArray<{ field: ImageField; label: TranslationKey }> = [
    { field: 'logoUri', label: 'settings.general.logo' },
    { field: 'watermarkUri', label: 'settings.general.watermark' },
  ];

  constructor() {
    this.load();
    // A fresh edit supersedes the last "saved" confirmation.
    effect(() => {
      this.model();
      this.openingCash();
      this.savedKey.set(null);
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
    this.errorKey.set(null);
    try {
      await this.stores.update(store.id, this.model());
      await this.stores.setOpeningCash(this.openingCash() ?? 0);
      this.savedKey.set('settings.general.saved');
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  onFile(event: Event, field: ImageField): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // let the user re-pick the same file after a rejection
    if (!file) {
      return;
    }
    this.imageErrorKey.set(null);
    if (!file.type.startsWith('image/')) {
      this.imageErrorKey.set('settings.general.imageType');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.imageErrorKey.set('settings.general.imageTooBig');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.model.update((m) => ({ ...m, [field]: reader.result as string }));
    reader.readAsDataURL(file);
  }

  removeImage(field: ImageField): void {
    this.imageErrorKey.set(null);
    this.model.update((m) => ({ ...m, [field]: '' }));
  }
}
