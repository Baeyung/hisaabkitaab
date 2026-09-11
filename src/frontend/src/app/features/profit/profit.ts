import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { LocaleService } from '../../core/i18n/locale.service';
import { ThemeService } from '../../core/theme/theme.service';
import { StoreService } from '../../core/store/store.service';
import { ProfitService } from '../../core/store/profit.service';
import { Profit as ProfitData } from '../../core/store/profit.models';
import { daysAgoIso, todayIso } from '../../shared/date.util';
import { ChartView } from '../../shared/chart/chart';
import { PrintHeader } from '../../shared/print-header';
import { WhatsAppButton } from '../../shared/whatsapp-button';
import { FONT, PALETTES, compactMoney, shortDate } from '../../shared/chart/chart-theme';
import { DateField } from '../../shared/date-field/date-field';
import { urlFilters } from '../../shared/url-filters';

/**
 * Profit analysis: what the shop kept, and what it kept it on.
 *
 * The dashboard answers "how much came in". This answers the question behind it, which needs a
 * cost against every sale — and no cost is written down when a bill is made. The backend
 * reconstructs them by replaying the goods ledger, so the first two things on this page are the
 * disclaimer saying so and the coverage meter saying how far it got. Everything below is only as
 * true as that meter, and burying it would be the one dishonest way to draw this screen.
 *
 * Default window is 30 days, not the dashboard's 7: a margin read over a week swings on one big
 * bill landing inside or outside it.
 */
@Component({
  selector: 'app-profit',
  imports: [RouterLink, ChartView, DateField, PrintHeader, WhatsAppButton],
  templateUrl: './profit.html',
})
export class Profit {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(ProfitService);
  private readonly theme = inject(ThemeService);

  private readonly palette = computed(() => PALETTES[this.theme.resolved()]);

  protected readonly filters = urlFilters({ from: daysAgoIso(29), to: todayIso() });
  protected readonly data = signal<ProfitData | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  /**
   * True once loaded with nothing sold and nothing spent in the window — there is no profit
   * question to answer. Expenses count: a month with rent paid and nothing sold is a loss, and
   * a friendly "nothing here" over it would be hiding the number.
   */
  protected readonly isEmpty = computed(() => {
    const d = this.data();
    return !!d && d.revenue === 0 && d.expenses === 0 && d.uncosted.length === 0;
  });

  protected readonly coverage = computed(() => Math.round(this.data()?.coveragePct ?? 0));

  /**
   * Banded rather than shown as a precise number, because the precision would be false: what the
   * shopkeeper needs off this bar is "trust it / mostly / don't", and a meter that reads 94.7%
   * invites arguing with the decimal instead of going and fixing six cost prices.
   */
  protected readonly coverageTone = computed(() => {
    const pct = this.coverage();
    return pct >= 95 ? 'good' : pct >= 70 ? 'fair' : 'poor';
  });

  /**
   * Whether anything on this screen was costed at all. At zero coverage every cost-derived figure
   * would be a confident 0 — cost, profit, margin — which reads as "you made everything you sold".
   * The template shows dashes instead, and the KPI hints say what to go and fix.
   */
  protected readonly measurable = computed(() => (this.data()?.coveragePct ?? 0) > 0);

  private readonly maxItemProfit = computed(() =>
    Math.max(1, ...(this.data()?.topItems ?? []).map((i) => i.profit)),
  );
  private readonly maxLoss = computed(() =>
    Math.max(1, ...(this.data()?.lossMakers ?? []).map((i) => Math.abs(i.profit))),
  );
  private readonly maxUncosted = computed(() =>
    Math.max(1, ...(this.data()?.uncosted ?? []).map((i) => i.revenue)),
  );

  /** The trend as the printout reads it: a canvas prints as a picture, a table prints as figures. */
  protected readonly dailyRows = computed(() => this.data()?.daily ?? []);

  /**
   * Two questions on one chart: bars are what each day made (green when it made something, red
   * when it did not), and the dashed line over them is the margin that took — a day can take more
   * money than the one before it and keep less of it, and that is exactly the day worth seeing.
   */
  protected readonly trendConfig = computed<ChartConfiguration>(() => {
    const pal = this.palette();
    const points = this.dailyRows();
    const rtl = this.locale.dir() === 'rtl';
    const config: ChartConfiguration<'bar' | 'line'> = {
      type: 'bar',
      data: {
        labels: points.map((p) => this.shortDate(p.date)),
        datasets: [
          {
            label: this.locale.t('profit.chart.profit'),
            data: points.map((p) => p.profit),
            backgroundColor: points.map((p) => (p.profit < 0 ? pal.red : pal.green)),
            borderRadius: 3,
            maxBarThickness: 34,
          },
          {
            type: 'line',
            label: this.locale.t('profit.chart.margin'),
            data: points.map((p) => p.marginPct),
            borderColor: pal.blue,
            backgroundColor: pal.blue,
            borderWidth: 2,
            borderDash: [6, 4],
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 5,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 4 } },
        font: { family: FONT },
        scales: {
          x: {
            reverse: rtl,
            grid: { display: false },
            border: { color: pal.line },
            // Flat and thinned. A month of dates turned 45 degrees is a smudge, and the
            // shopkeeper reads this axis to place a spike in the month, not to name every day.
            ticks: {
              color: pal.muted,
              font: { family: FONT, size: 11 },
              autoSkip: true,
              maxRotation: 0,
              maxTicksLimit: 8,
            },
          },
          y: {
            border: { display: false },
            grid: { color: pal.line },
            ticks: {
              color: pal.muted,
              font: { family: FONT, size: 11 },
              maxTicksLimit: 5,
              callback: (v) => compactMoney(Number(v)),
            },
          },
          // Margin is a percentage, not money — its own axis, and no gridlines of its own so
          // the chart keeps one set of horizontal rules.
          y1: {
            position: 'right',
            border: { display: false },
            grid: { drawOnChartArea: false },
            ticks: {
              color: pal.blue,
              font: { family: FONT, size: 11 },
              maxTicksLimit: 5,
              callback: (v) => `${Math.round(Number(v))}%`,
            },
          },
        },
        plugins: {
          legend: {
            rtl,
            position: 'top',
            align: 'end',
            labels: {
              color: pal.ink,
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              font: { family: FONT, size: 12 },
              padding: 16,
            },
          },
          tooltip: {
            rtl,
            backgroundColor: pal.tooltipBg,
            titleColor: pal.tooltipInk,
            bodyColor: pal.tooltipInk,
            padding: 10,
            titleFont: { family: FONT, size: 12 },
            bodyFont: { family: FONT, size: 12 },
            callbacks: {
              label: (c) =>
                c.datasetIndex === 1
                  ? `${c.dataset.label}: ${Math.round(Number(c.parsed.y))}%`
                  : `${c.dataset.label}: ${this.locale.money(Number(c.parsed.y))}`,
            },
          },
        },
      },
    };
    return config as ChartConfiguration;
  });

  constructor() {
    effect(() => {
      void this.load(this.filters.from(), this.filters.to());
    });
  }

  async load(from = this.filters.from(), to = this.filters.to()): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.data.set(await this.api.getRange(from, to));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  print(): void {
    window.print();
  }

  /**
   * A cost-derived figure, or a dash when nothing was costed. Used for every number the replay
   * had to price to produce: at zero coverage those are all structurally zero, and a zero read as
   * a measurement is worse than an admission that there is nothing to measure.
   */
  protected costFigure(value: number): string {
    return this.measurable() ? this.locale.money(value) : '—';
  }

  /**
   * A figure the sum subtracts, written with its sign so the column reads as arithmetic
   * rather than as five unrelated amounts. Held in a Unicode LTR isolate for the same
   * reason {@link LocaleService.formatNumber} is: the minus is a neutral character, and
   * beside Urdu it drifts to the far side of the figure ("Rs 407,050 −").
   */
  protected signed(value: number): string {
    return value === 0
      ? this.locale.money(0)
      : `\u2066− ${this.locale.money(Math.abs(value))}\u2069`;
  }

  /** What share of the money taken the shop actually kept — the headline's one line of context. */
  protected netPct(d: ProfitData): number {
    return d.revenue === 0 ? 0 : Math.round((d.netProfit / d.revenue) * 100);
  }

  protected margin(pct: number): string {
    return this.locale.t('profit.margin', { pct: Math.round(pct) + '' });
  }

  /** Green above water, red below — the same reading as every other amount in the app. */
  protected tone(value: number): string {
    return value < 0 ? 'amt--out' : 'amt--in';
  }

  /** Which of the two fixes an unpriced design needs, named as the thing to go and do. */
  protected fixFor(everPurchased: boolean): string {
    return this.locale.t(
      everPurchased ? 'profit.uncosted.fix.cost' : 'profit.uncosted.fix.purchase',
    );
  }

  protected itemPct(profit: number): number {
    return Math.round((Math.max(0, profit) / this.maxItemProfit()) * 100);
  }

  protected lossPct(profit: number): number {
    return Math.round((Math.abs(profit) / this.maxLoss()) * 100);
  }

  protected uncostedPct(revenue: number): number {
    return Math.round((revenue / this.maxUncosted()) * 100);
  }

  protected day(iso: string): string {
    return this.locale.date(iso);
  }

  /** A plain-language sentence of the chart's numbers, for screen readers. */
  protected trendLabel(): string {
    const d = this.data();
    if (!d) {
      return '';
    }
    return this.locale.t('profit.trend.aria', {
      profit: this.locale.money(d.grossProfit),
      revenue: this.locale.money(d.revenue),
    });
  }

  private shortDate(iso: string): string {
    return shortDate(iso, this.locale.locale());
  }
}
