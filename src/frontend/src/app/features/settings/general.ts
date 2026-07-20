import { Component, computed, effect, inject, signal } from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { Store, StoreDraft } from '../../core/store/store.models';

// ponytail: base64-image-in-DB stopgap — this cap keeps a store row and every
// GET /api/stores payload sane until bucket upload lands (docs/tickets/HK-store-media-object-storage.md).
const MAX_IMAGE_BYTES = 300 * 1024;
const EMPTY_DRAFT: StoreDraft = { name: '', address: '', contact: '', logoUri: '', watermarkUri: '' };

type ImageField = 'logoUri' | 'watermarkUri';

/**
 * Store Settings › General. Loads the owner's first (and, for now, only) store.
 * With none, the card becomes a "set up your store" invitation that creates one;
 * with one, it edits in place. Logo/watermark are read as base64 data URIs — see
 * the object-storage ticket referenced above.
 */
@Component({
  selector: 'app-general',
  imports: [FormField],
  templateUrl: './general.html',
  styleUrl: './general.css',
})
export class SettingsGeneral {
  protected readonly locale = inject(LocaleService);
  private readonly stores = inject(StoreService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly savedKey = signal<TranslationKey | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly imageErrorKey = signal<TranslationKey | null>(null);

  /** The persisted store, or null when the user has none yet (create mode). */
  protected readonly store = signal<Store | null>(null);

  /** Opening drawer balance — cash on hand at onboarding. null = field empty (clears it). */
  protected readonly openingCash = signal<number | null>(null);

  protected readonly model = signal<StoreDraft>({ ...EMPTY_DRAFT });
  protected readonly storeForm = form(this.model, (path) => {
    required(path.name);
  });

  /** First letter of the typed name — fills the nameplate mark live while creating. */
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
      const first = (await this.stores.list())[0] ?? null;
      this.store.set(first);
      // Opening drawer balance only exists once a store does; 0 → empty field.
      const cash = first ? await this.stores.getOpeningCash() : 0;
      this.openingCash.set(cash > 0 ? cash : null);
      // Backend nullable columns can arrive as null; forms want strings.
      this.model.set(
        first
          ? {
              name: first.name ?? '',
              address: first.address ?? '',
              contact: first.contact ?? '',
              logoUri: first.logoUri ?? '',
              watermarkUri: first.watermarkUri ?? '',
            }
          : { ...EMPTY_DRAFT },
      );
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
    this.saving.set(true);
    this.errorKey.set(null);
    try {
      const current = this.store();
      const draft = this.model();
      const saved = current
        ? await this.stores.update(current.id, draft)
        : await this.stores.create(draft);
      this.store.set(saved);
      // Store must exist before its drawer balance can be set, so this runs after.
      await this.stores.setOpeningCash(this.openingCash() ?? 0);
      this.savedKey.set(current ? 'settings.general.saved' : 'settings.general.created');
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
