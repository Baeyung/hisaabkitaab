import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { LocaleService } from '../../core/i18n/locale.service';
import { DashboardService } from '../../core/store/dashboard.service';
import { Dashboard as DashboardData } from '../../core/store/dashboard.models';
import { daysAgoIso, todayIso } from '../../shared/date.util';
import { ChartView } from '../../shared/chart/chart';
import { DateField } from '../../shared/date-field/date-field';

// Semantic tokens from styles.css, mirrored here so charts read the same
// money-in/money-out language as the rest of the app.
const GREEN = '#1f7a4d'; // money in / revenue / receivable
const RED = '#a8342a'; //   money out / spend / payable / expenses
const BLUE = '#1d4e7a'; //  running cash balance (neutral, not a money-in/out signal)
const AMBER = '#c98a2b'; // aging warning — dues 30–60 days old
const INK = '#23201c'; //   primary text
const MUTED = '#6b655c'; // axis labels
const LINE = 'rgba(35, 32, 28, 0.12)'; // hairline grid
const FONT = "'IBM Plex Sans', system-ui, sans-serif";

// Categorical palette for the sales-mix doughnut. Deliberately avoids the
// semantic green/red so a design's slice never reads as "money in/out"; a
// calm pine → teal → amber → blue → olive run, with muted clay for "Other".
const MIX = ['#1f5c4d', '#2d8f6b', '#3f9c93', '#c98a2b', '#1d4e7a', '#6b8f3a'];
const MIX_OTHER = '#b0a99c';

/**
 * The analytics home screen. One backend call feeds every widget for the chosen
 * window; default is the last 7 days, and the from/to inputs mirror the cashbook.
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, ChartView, DateField],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(DashboardService);

  protected readonly fromDate = signal(daysAgoIso(6));
  protected readonly toDate = signal(todayIso());
  protected readonly data = signal<DashboardData | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noStore = signal(false);

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

  /** Revenue (sales) and spending as flow lines over the window, cash as a running balance. */
  protected readonly trendConfig = computed<ChartConfiguration>(() => {
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
      pointBorderColor: '#fff',
      pointBorderWidth: 1.5,
    });
    return {
      type: 'line',
      data: {
        labels: points.map((p) => this.shortDate(p.date)),
        datasets: [
          line(this.locale.t('dash.sales'), points.map((p) => p.sales), GREEN),
          line(this.locale.t('dash.spend'), points.map((p) => p.spend), RED),
          // Cash is a running balance, not a daily flow — dashed, on its own
          // right-hand axis so its scale never squashes the flow lines.
          {
            ...line(this.locale.t('dash.cash'), points.map((p) => p.cash), BLUE),
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
            border: { color: LINE },
            ticks: { color: MUTED, font: { family: FONT, size: 11 } },
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: LINE },
            ticks: { color: MUTED, font: { family: FONT, size: 11 }, maxTicksLimit: 5, callback: (v) => this.compact(Number(v)) },
          },
          // Secondary axis for the cash balance. Its gridlines are hidden so the
          // chart keeps one set of horizontal rules (the flows' axis).
          y1: {
            position: 'right',
            border: { display: false },
            grid: { drawOnChartArea: false },
            ticks: { color: BLUE, font: { family: FONT, size: 11 }, maxTicksLimit: 5, callback: (v) => this.compact(Number(v)) },
          },
        },
        plugins: {
          legend: {
            rtl,
            position: 'top',
            align: 'end',
            labels: { color: INK, boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { family: FONT, size: 12 }, padding: 16 },
          },
          tooltip: {
            rtl,
            backgroundColor: INK,
            padding: 10,
            titleFont: { family: FONT, size: 12 },
            bodyFont: { family: FONT, size: 12 },
            callbacks: { label: (c) => `${c.dataset.label}: ${this.locale.money(Number(c.parsed.y))}` },
          },
        },
      },
    };
  });

  /** Revenue share by design, with everything past the top few folded into "Other". */
  protected readonly salesMixConfig = computed<ChartConfiguration>(() => {
    const d = this.data();
    const items = d?.topItems ?? [];
    const labels = items.map((i) => i.name);
    const values = items.map((i) => i.revenue);
    const colors = items.map((_, i) => MIX[i % MIX.length]);
    const other = (d?.sales ?? 0) - values.reduce((a, b) => a + b, 0);
    if (other > 1) {
      labels.push(this.locale.t('dash.mix.other'));
      values.push(other);
      colors.push(MIX_OTHER);
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
    const parties = this.data()?.staleReceivables ?? [];
    const rtl = this.locale.dir() === 'rtl';
    const maxAmount = Math.max(1, ...parties.map((p) => p.amount));
    const color = (days: number) => (days >= 60 ? RED : days >= 30 ? AMBER : MUTED);
    const config: ChartConfiguration<'bubble'> = {
      type: 'bubble',
      data: {
        datasets: [
          {
            label: this.locale.t('dash.stale.title'),
            data: parties.map((p) => ({ x: p.daysStale, y: p.amount, r: 6 + (p.amount / maxAmount) * 14 })),
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
            title: { display: true, text: this.locale.t('dash.stale.xaxis'), color: MUTED, font: { family: FONT, size: 11 } },
            grid: { color: LINE },
            border: { color: LINE },
            ticks: { color: MUTED, font: { family: FONT, size: 11 }, callback: (v) => `${v}d` },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: this.locale.t('dash.stale.yaxis'), color: MUTED, font: { family: FONT, size: 11 } },
            border: { display: false },
            grid: { color: LINE },
            ticks: { color: MUTED, font: { family: FONT, size: 11 }, maxTicksLimit: 5, callback: (v) => this.compact(Number(v)) },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            rtl,
            backgroundColor: INK,
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
    void this.load();
  }

  /** Shared doughnut config: calm ring, bottom legend, money + percent tooltip. */
  private doughnut(labels: string[], values: number[], colors: string[]): ChartConfiguration {
    const rtl = this.locale.dir() === 'rtl';
    const total = values.reduce((a, b) => a + b, 0) || 1;
    // Built as a doughnut config (for `cutout`), widened to the generic type the
    // dumb chart wrapper accepts — it forwards any chart.js config verbatim.
    const config: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderColor: '#fff', borderWidth: 2, hoverOffset: 6 }],
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
            labels: { color: INK, boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { family: FONT, size: 12 }, padding: 12 },
          },
          tooltip: {
            rtl,
            backgroundColor: INK,
            padding: 10,
            bodyFont: { family: FONT, size: 12 },
            callbacks: {
              label: (c) => ` ${c.label}: ${this.locale.money(Number(c.parsed))} (${Math.round((Number(c.parsed) / total) * 100)}%)`,
            },
          },
        },
      },
    };
    return config as ChartConfiguration;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.noStore.set(false);
    try {
      this.data.set(await this.api.getRange(this.fromDate(), this.toDate()));
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        this.noStore.set(true);
      } else {
        this.loadError.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  setFrom(value: string): void {
    if (!value || value === this.fromDate()) {
      return;
    }
    this.fromDate.set(value);
    void this.load();
  }

  setTo(value: string): void {
    if (!value || value === this.toDate()) {
      return;
    }
    this.toDate.set(value);
    void this.load();
  }

  /** Bar-fill width for a list row, as a percentage of the column's largest value. */
  protected itemPct(revenue: number): number {
    return Math.round((revenue / this.maxItemRevenue()) * 100);
  }

  protected expensePct(total: number): number {
    return Math.round((total / this.maxExpense()) * 100);
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
    return this.locale.t('dash.mix.aria', { name: items[0].name, amount: this.locale.money(items[0].revenue) });
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
    return new Date(iso).toLocaleDateString(this.locale.locale(), { month: 'short', day: 'numeric' });
  }

  /** Axis-friendly short money: 176000 → "176k", 1_200_000 → "1.2m". */
  private compact(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) {
      return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
    }
    if (abs >= 1000) {
      return Math.round(n / 1000) + 'k';
    }
    return String(n);
  }
}
