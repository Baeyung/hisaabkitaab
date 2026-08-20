import { Component, effect, inject, input, signal } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { BalanceDirection } from '../../core/store/balance.models';
import { directionClass, khataAmount } from '../../shared/balance.util';
import { PrintHeader } from '../../shared/print-header';
import { ReportService } from './report.service';
import { PartyReminder } from './report.models';

/**
 * One khata holder's statement, as the monthly job sends it to them.
 *
 * The same document the shopkeeper already shares by hand from the khata screen, because the
 * customer chased on the 31st and asking about it on the 2nd has to be looking at the same
 * paper the shop is. See `DailyReportPage` for how these pages are opened, why they are in
 * English, and why `data-report-ready` is never set on a failure.
 */
@Component({
  selector: 'app-reminder-report',
  imports: [PrintHeader],
  templateUrl: './reminder-report.html',
  styleUrl: './report.css',
})
export class ReminderReportPage {
  readonly storeId = input.required<string>();
  readonly partyId = input.required<string>();
  readonly date = input.required<string>();
  readonly token = input.required<string>();

  protected readonly locale = inject(LocaleService);
  private readonly api = inject(ReportService);

  protected readonly reminder = signal<PartyReminder | null>(null);

  constructor() {
    // See `DailyReportPage`: the router binds these after construction, so the read happens in
    // an effect rather than in the constructor body.
    effect(() => {
      void this.load(this.storeId(), this.partyId(), this.date(), this.token());
    });
  }

  protected readonly khataAmount = khataAmount;

  protected tone(direction: BalanceDirection): string {
    return directionClass(direction);
  }

  /** "They owe" / "You owe" — colour never carries the direction on its own. */
  protected direction(direction: BalanceDirection): string {
    switch (direction) {
      case 'THEY_OWE_YOU':
        return 'To receive';
      case 'YOU_OWE_THEM':
        return 'To pay';
      default:
        return 'Settled';
    }
  }

  private async load(storeId: string, partyId: string, date: string, token: string): Promise<void> {
    this.reminder.set(await this.api.reminder(storeId, partyId, date, token));
  }
}
