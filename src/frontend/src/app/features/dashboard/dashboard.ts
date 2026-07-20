import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { LocaleService } from '../../core/i18n/locale.service';
import { DashboardService } from '../../core/store/dashboard.service';
import { Dashboard as DashboardData } from '../../core/store/dashboard.models';
import { daysAgoIso, todayIso } from '../../shared/date.util';
import { ChartView } from '../../shared/chart/chart';

// Semantic tokens from styles.css, mirrored here so charts read the same
// money-in/money-out language as the rest of the app.
const GREEN = '#1f7a4d'; // money in / sales / receivable
const RED = '#a8342a'; //   money out / spend / payable
const PINE = '#1f5c4d'; //  brand — profit
const INK = '#23201c'; //   primary text
const MUTED = '#6b655c'; // axis labels
const LINE = 'rgba(35, 32, 28, 0.12)'; // hairline grid
const FONT = "'IBM Plex Sans', system-ui, sans-serif";

/**
 * The analytics home screen. Cash position and profit are shown as two distinct
 * cards on purpose (APPLICATION_DOMAIN §3.4) — a shop can profit today yet see
 * its cash fall. One backend call feeds every widget for the chosen window;
 * default is the last 7 days, and the from/to inputs mirror the cashbook.
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, ChartView],
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

  /** Grouped bars (sales vs spend) with profit as an overlaid line. */
  protected readonly trendConfig = computed<ChartConfiguration>(() => {
    const d = this.data();
    const points = d?.daily ?? [];
    const rtl = this.locale.dir() === 'rtl';
    return {
      type: 'bar',
      data: {
        labels: points.map((p) => this.shortDate(p.date)),
        datasets: [
          {
            label: this.locale.t('dash.sales'),
            data: points.map((p) => p.sales),
            backgroundColor: GREEN,
            borderRadius: 4,
            maxBarThickness: 22,
          },
          {
            label: this.locale.t('dash.spend'),
            data: points.map((p) => p.spend),
            backgroundColor: RED,
            borderRadius: 4,
            maxBarThickness: 22,
          },
          {
            type: 'line',
            label: this.locale.t('dash.profit'),
            data: points.map((p) => p.profit),
            borderColor: PINE,
            backgroundColor: '#fff',
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: PINE,
            pointBorderColor: '#fff',
            pointBorderWidth: 1.5,
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

  constructor() {
    void this.load();
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
      profit: this.locale.money(d.profit),
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
