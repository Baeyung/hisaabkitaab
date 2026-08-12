import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { LocaleService } from '../../core/i18n/locale.service';
import { ThemeService } from '../../core/theme/theme.service';
import { expenseCategoryLabel } from '../../core/store/event.models';
import { StoreService } from '../../core/store/store.service';
import { DashboardService } from '../../core/store/dashboard.service';
import { Dashboard as DashboardData } from '../../core/store/dashboard.models';
import { daysAgoIso, todayIso } from '../../shared/date.util';
import { ChartView } from '../../shared/chart/chart';
import { PrintHeader } from '../../shared/print-header';
import { WhatsAppButton } from '../../shared/whatsapp-button';
import { FONT, PALETTES, compactMoney, shortDate } from '../../shared/chart/chart-theme';
import { DateField } from '../../shared/date-field/date-field';
import { urlFilters } from '../../shared/url-filters';

/**
 * The analytics home screen. One backend call feeds every widget for the chosen
 * window; default is the last 7 days, and the from/to inputs mirror the cashbook.
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, ChartView, DateField, PrintHeader, WhatsAppButton],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(DashboardService);
  private readonly theme = inject(ThemeService);

  /** Every chart config reads this, so all of them retint on a theme change. */
  private readonly palette = computed(() => PALETTES[this.theme.resolved()]);

  /** Display label for a spend head: seed tokens translated, custom names shown raw. */
  protected readonly categoryLabel = (name: string): string =>
    expenseCategoryLabel(name, (k) => this.locale.t(k));

  /** The window every widget is read over, carried in the URL so Back walks it back. */
  protected readonly filters = urlFilters({ from: daysAgoIso(6), to: todayIso() });
  protected readonly data = signal<DashboardData | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  /**
   * Arrived straight out of the guided setup (`?new=1`). The page is empty either
   * way; this only changes what the empty state says — a shop that was just opened
   * gets told it is open, instead of being told there is nothing to show.
   */
  protected readonly justOpened = inject(ActivatedRoute).snapshot.queryParamMap.has('new');

  /** True once loaded with zero activity in the window — the friendly empty state. */
  protected readonly isEmpty = computed(() => {
    const d = this.data();
    return (
      !!d &&
      d.sales === 0 &&
      d.spend === 0 &&
      d.cashPosition === 0 &&
      d.topItems.length === 0 &&
      d.deadStock.length === 0 &&
      d.topReceivables.length === 0 &&
      d.topPayables.length === 0
    );
  });

  private readonly maxItemRevenue = computed(() =>
    Math.max(1, ...(this.data()?.topItems ?? []).map((i) => i.revenue)),
  );
  private readonly maxExpense = computed(() =>
    Math.max(1, ...(this.data()?.topExpenses ?? []).map((e) => e.total)),
  );

  /*
   * ── What the printout reads instead of the charts ───────────────────────
   * A canvas prints as a picture of a screen: no hover, no tooltip, axis type
   * sized for a monitor, and a legend that names colours the reader then has to
   * match by eye. Everything below is the same data as a table, which is what
   * the shopkeeper's accountant wanted anyway — the figures, in a column, with
   * the days named. The charts stay on screen; these stay on paper.
   */

  /** The trend line, day by day. Ordered as the backend sent it: oldest first. */
  protected readonly dailyRows = computed(() => this.data()?.daily ?? []);
  private readonly maxDailySales = computed(() =>
    Math.max(1, ...this.dailyRows().map((p) => p.sales)),
  );
  private readonly maxDailySpend = computed(() =>
    Math.max(1, ...this.dailyRows().map((p) => p.spend)),
  );

  /** The bubble field, worst first — the reading its top-right corner encoded. */
  protected readonly agedRows = computed(() =>
    [...(this.data()?.staleReceivables ?? [])].sort((a, b) => b.daysStale - a.daysStale),
  );

  /**
   * Everything the top-selling list doesn't name, so the printed shares still
   * sum to the period's revenue — the slice the doughnut called "Other designs".
   */
  protected readonly otherRevenue = computed(() => {
    const d = this.data();
    return d ? d.sales - d.topItems.reduce((sum, i) => sum + i.revenue, 0) : 0;
  });

  /** Revenue (sales) and spending as flow lines over the window, cash as a running balance. */
  protected readonly trendConfig = computed<ChartConfiguration>(() => {
    const pal = this.palette();
    const d = this.data();
    const points = d?.daily ?? [];
    const rtl = this.locale.dir() === 'rtl';
    const line = (label: string, values: number[], color: string) => ({
      label,
      data: values,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: color,
      pointBorderColor: pal.card,
      pointBorderWidth: 1.5,
    });
    return {
      type: 'line',
      data: {
        labels: points.map((p) => this.shortDate(p.date)),
        datasets: [
          line(
            this.locale.t('dash.sales'),
            points.map((p) => p.sales),
            pal.green,
          ),
          line(
            this.locale.t('dash.spend'),
            points.map((p) => p.spend),
            pal.red,
          ),
          // Cash is a running balance, not a daily flow — dashed, on its own
          // right-hand axis so its scale never squashes the flow lines.
          {
            ...line(
              this.locale.t('dash.cash'),
              points.map((p) => p.cash),
              pal.blue,
            ),
            yAxisID: 'y1',
            borderDash: [6, 4],
            pointRadius: 2,
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
            ticks: { color: pal.muted, font: { family: FONT, size: 11 } },
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: pal.line },
            ticks: {
              color: pal.muted,
              font: { family: FONT, size: 11 },
              maxTicksLimit: 5,
              callback: (v) => this.compact(Number(v)),
            },
          },
          // Secondary axis for the cash balance. Its gridlines are hidden so the
          // chart keeps one set of horizontal rules (the flows' axis).
          y1: {
            position: 'right',
            border: { display: false },
            grid: { drawOnChartArea: false },
            ticks: {
              color: pal.blue,
              font: { family: FONT, size: 11 },
              maxTicksLimit: 5,
              callback: (v) => this.compact(Number(v)),
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
              label: (c) => `${c.dataset.label}: ${this.locale.money(Number(c.parsed.y))}`,
            },
          },
        },
      },
    };
  });

  /** Revenue share by design, with everything past the top few folded into "Other". */
  protected readonly salesMixConfig = computed<ChartConfiguration>(() => {
    const pal = this.palette();
    const d = this.data();
    const items = d?.topItems ?? [];
    const labels = items.map((i) => i.name);
    const values = items.map((i) => i.revenue);
    const colors = items.map((_, i) => pal.mix[i % pal.mix.length]);
    const other = (d?.sales ?? 0) - values.reduce((a, b) => a + b, 0);
    if (other > 1) {
      labels.push(this.locale.t('dash.mix.other'));
      values.push(other);
      colors.push(pal.mixOther);
    }
    return this.doughnut(labels, values, colors);
  });

  /** True once loaded with at least one party still owing on an aged charge. */
  protected readonly hasStale = computed(() => (this.data()?.staleReceivables?.length ?? 0) > 0);

  /**
   * Receivable aging as a bubble field: x = days the oldest due has sat,
   * y = amount owed, dot size scales with amount. Worst offenders land
   * top-right and deepen from muted → amber → red as they age.
   */
  protected readonly staleConfig = computed<ChartConfiguration>(() => {
    const pal = this.palette();
    const parties = this.data()?.staleReceivables ?? [];
    const rtl = this.locale.dir() === 'rtl';
    const maxAmount = Math.max(1, ...parties.map((p) => p.amount));
    const color = (days: number) => (days >= 60 ? pal.red : days >= 30 ? pal.amber : pal.muted);
    const config: ChartConfiguration<'bubble'> = {
      type: 'bubble',
      data: {
        datasets: [
          {
            label: this.locale.t('dash.stale.title'),
            data: parties.map((p) => ({
              x: p.daysStale,
              y: p.amount,
              r: 6 + (p.amount / maxAmount) * 14,
            })),
            backgroundColor: parties.map((p) => color(p.daysStale) + '99'),
            borderColor: parties.map((p) => color(p.daysStale)),
            borderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 6 },
        font: { family: FONT },
        scales: {
          x: {
            reverse: rtl,
            beginAtZero: true,
            title: {
              display: true,
              text: this.locale.t('dash.stale.xaxis'),
              color: pal.muted,
              font: { family: FONT, size: 11 },
            },
            grid: { color: pal.line },
            border: { color: pal.line },
            ticks: { color: pal.muted, font: { family: FONT, size: 11 }, callback: (v) => `${v}d` },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: this.locale.t('dash.stale.yaxis'),
              color: pal.muted,
              font: { family: FONT, size: 11 },
            },
            border: { display: false },
            grid: { color: pal.line },
            ticks: {
              color: pal.muted,
              font: { family: FONT, size: 11 },
              maxTicksLimit: 5,
              callback: (v) => this.compact(Number(v)),
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            rtl,
            backgroundColor: pal.tooltipBg,
            titleColor: pal.tooltipInk,
            bodyColor: pal.tooltipInk,
            padding: 10,
            titleFont: { family: FONT, size: 12 },
            bodyFont: { family: FONT, size: 12 },
            callbacks: {
              title: (items) => parties[items[0].dataIndex]?.name ?? '',
              label: (c) => {
                const p = parties[c.dataIndex];
                return `${this.locale.money(p.amount)} · ${this.locale.t('dash.stale.days', { days: p.daysStale + '' })}`;
              },
            },
          },
        },
      },
    };
    return config as ChartConfiguration;
  });

  constructor() {
    // Fetch whenever the window changes — a picked date, or a Back/Forward that
    // restored an earlier one. Runs once on init.
    effect(() => {
      void this.load(this.filters.from(), this.filters.to());
    });
  }

  /** Shared doughnut config: calm ring, bottom legend, money + percent tooltip. */
  private doughnut(labels: string[], values: number[], colors: string[]): ChartConfiguration {
    const pal = this.palette();
    const rtl = this.locale.dir() === 'rtl';
    const total = values.reduce((a, b) => a + b, 0) || 1;
    // Built as a doughnut config (for `cutout`), widened to the generic type the
    // dumb chart wrapper accepts — it forwards any chart.js config verbatim.
    const config: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderColor: pal.card,
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        layout: { padding: 4 },
        plugins: {
          legend: {
            rtl,
            position: 'bottom',
            labels: {
              color: pal.ink,
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              font: { family: FONT, size: 12 },
              padding: 12,
            },
          },
          tooltip: {
            rtl,
            backgroundColor: pal.tooltipBg,
            titleColor: pal.tooltipInk,
            bodyColor: pal.tooltipInk,
            padding: 10,
            bodyFont: { family: FONT, size: 12 },
            callbacks: {
              label: (c) =>
                ` ${c.label}: ${this.locale.money(Number(c.parsed))} (${Math.round((Number(c.parsed) / total) * 100)}%)`,
            },
          },
        },
      },
    };
    return config as ChartConfiguration;
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

  /** Bar-fill width for a list row, as a percentage of the column's largest value. */
  protected itemPct(revenue: number): number {
    return Math.round((revenue / this.maxItemRevenue()) * 100);
  }

  protected expensePct(total: number): number {
    return Math.round((total / this.maxExpense()) * 100);
  }

  /** Cell-fill widths for the printed daily table, scaled per column. */
  protected dailySalesPct(sales: number): number {
    return Math.round((sales / this.maxDailySales()) * 100);
  }

  protected dailySpendPct(spend: number): number {
    return Math.round((spend / this.maxDailySpend()) * 100);
  }

  /** An item's cut of the period's revenue — the doughnut's slice, as a figure. */
  protected sharePct(revenue: number): number {
    return Math.round((revenue / Math.max(1, this.data()?.sales ?? 0)) * 100);
  }

  /** Same three aging bands the bubbles are tinted by: fresh, 30 days, 60 days. */
  protected agedTone(days: number): string {
    return days >= 60 ? 'amt--out' : days >= 30 ? 'dw-aged' : '';
  }

  /** How long a due has sat. Reads "1 day", not "1 days" — this goes to an accountant. */
  protected waited(days: number): string {
    return this.locale.t(days === 1 ? 'dash.print.day' : 'dash.print.days', { days: days + '' });
  }

  /** How many entries make up a spend head. Same singular care as `waited`. */
  protected entryCount(count: number): string {
    return this.locale.t(count === 1 ? 'dash.expenses.count.one' : 'dash.expenses.count', {
      count: count + '',
    });
  }

  /** A day, as the printed table's row label. Public so the template can call it. */
  protected day(iso: string): string {
    return this.shortDate(iso);
  }

  /** A plain-language sentence of the chart's numbers, for screen readers. */
  protected trendLabel(): string {
    const d = this.data();
    if (!d) {
      return '';
    }
    return this.locale.t('dash.trend.aria', {
      sales: this.locale.money(d.sales),
      spend: this.locale.money(d.spend),
      cash: this.locale.money(d.cashPosition),
    });
  }

  protected mixLabel(): string {
    const items = this.data()?.topItems ?? [];
    if (items.length === 0) {
      return this.locale.t('dash.topItems.empty');
    }
    return this.locale.t('dash.mix.aria', {
      name: items[0].name,
      amount: this.locale.money(items[0].revenue),
    });
  }

  protected staleLabel(): string {
    const parties = this.data()?.staleReceivables ?? [];
    if (parties.length === 0) {
      return this.locale.t('dash.stale.empty');
    }
    const worst = parties.reduce((a, b) => (b.daysStale > a.daysStale ? b : a));
    return this.locale.t('dash.stale.aria', {
      name: worst.name,
      amount: this.locale.money(worst.amount),
      days: worst.daysStale + '',
    });
  }

  private shortDate(iso: string): string {
    return shortDate(iso, this.locale.locale());
  }

  private compact(n: number): string {
    return compactMoney(n);
  }
}
