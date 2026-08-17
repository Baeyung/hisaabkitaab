import { Component, computed, inject, signal } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { PlanService } from '../../core/plan/plan.service';
import { StoreService } from '../../core/store/store.service';
import { ReportSettings, StoreSettings } from '../../core/store/store.models';

/** What a shop that has never opened this screen means: nothing goes out. Mirrors the backend. */
const OFF: ReportSettings = {
  dailyEnabled: false,
  dailyTime: '20:00',
  reminderEnabled: false,
  reminderDay: 31,
  reminderTime: '10:00',
  reminderMinAmount: 0,
  reminderMinDaysStale: 30,
};

/**
 * Store Settings › Reports — the shop's two scheduled sends: the day's books to the owner every
 * evening, and a khata statement to whoever owes past the shop's own threshold once a month.
 *
 * Owner-only, and off until switched on. That default is the whole reason this screen has to be
 * opened deliberately rather than configured during onboarding: the reminders put a message on
 * a customer's phone about money, and a shop halfway through keying its opening khatas would be
 * chasing people over balances that are not true yet.
 *
 * The plan gates each half independently — the nightly report is one thing to sell and the
 * reminders another — and this greys out what the plan does not cover. That is a courtesy, not
 * the rule: `ReportScheduler` asks the plan again when the job fires, so a plan that lapses
 * after a setting was saved stops the sends without anybody having to come back here.
 *
 * Times are plain `<input type="time">` and the day a plain number, so there is no picker to
 * maintain and the value that reaches the backend is already the `HH:mm` it stores.
 */
@Component({
  selector: 'app-settings-reports',
  templateUrl: './reports.html',
  // The buttons and inputs, and the switch, shared with Menu and General; the page frame is
  // in reports.css, which says there why it is a copy rather than a fourth shared file.
  styleUrls: ['./settings-table.css', './settings-switch.css', './reports.css'],
})
export class SettingsReports {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  protected readonly plan = inject(PlanService);

  protected readonly saving = signal(false);
  protected readonly savedKey = signal<TranslationKey | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  /** Edited locally and only sent on save, like every other settings screen here. */
  protected readonly form = signal<ReportSettings>({ ...OFF, ...this.saved()?.reports });

  /**
   * How many parties this shop would actually chase, for the line under the threshold fields.
   * Null when there is no ceiling to quote — an unknown or unenforced plan.
   */
  protected readonly contactCap = computed(() => this.plan.reminderContacts());

  protected set<K extends keyof ReportSettings>(key: K, value: ReportSettings[K]): void {
    this.savedKey.set(null);
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  /** `<input>` hands back strings; a blank or nonsense number reads as the field's floor. */
  protected setNumber(
    key: 'reminderDay' | 'reminderMinAmount' | 'reminderMinDaysStale',
    raw: string,
    min: number,
    max: number,
  ): void {
    const parsed = Number(raw);
    this.set(key, Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.errorKey.set(null);
    try {
      // Spread the stored document rather than rebuilding it: the endpoint replaces the whole
      // arrangement, and this screen has no business touching the shop's menu.
      const settings = this.stores.current()?.settings;
      await this.stores.updateSettings({ ...(settings as StoreSettings), reports: this.form() });
      this.savedKey.set('settings.reports.saved');
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  private saved(): StoreSettings | undefined {
    return this.stores.current()?.settings;
  }
}
