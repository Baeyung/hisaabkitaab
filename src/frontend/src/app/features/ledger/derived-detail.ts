import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { LedgerService } from '../../core/store/ledger.service';
import { DerivedGroup } from '../../core/store/ledger.models';
import { PrintHeader } from '../../shared/print-header';

/**
 * One derived expense group's statement: every same-note expense (bijli,
 * mazdoori, transport) with a running total. Reuses the khata's derived
 * endpoint — it already carries each group's rows — and looks the group up by
 * its description, which arrives URL-encoded as the route key.
 */
@Component({
  selector: 'app-derived-detail',
  imports: [RouterLink, PrintHeader],
  templateUrl: './derived-detail.html',
})
export class DerivedDetail {
  readonly key = input.required<string>();

  protected readonly locale = inject(LocaleService);
  private readonly api = inject(LedgerService);

  protected readonly group = signal<DerivedGroup | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);

  constructor() {
    effect(() => {
      void this.load(this.key());
    });
  }

  async load(key: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);
    const description = decodeURIComponent(key);
    try {
      const match = (await this.api.listDerived()).find((g) => g.description === description) ?? null;
      this.group.set(match);
      this.notFound.set(match === null);
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        this.notFound.set(true);
      } else {
        this.loadError.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  print(): void {
    window.print();
  }
}
