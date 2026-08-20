import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { LocaleService } from '../../core/i18n/locale.service';
import { ThemeService } from '../../core/theme/theme.service';
import { DashboardService } from '../../core/store/dashboard.service';
import { StoreComparison } from '../../core/store/dashboard.models';
import { ChartView } from '../../shared/chart/chart';
import { FONT, PALETTES, compactMoney, shortDate } from '../../shared/chart/chart-theme';
import { DateField } from '../../shared/date-field/date-field';
import { OuterBar } from '../../shared/outer-bar/outer-bar';
import { daysAgoIso, todayIso } from '../../shared/date.util';
import { urlFilters } from '../../shared/url-filters';
import { AmountLegend } from '../../shared/amount-legend';

/**
 * Every shop the user owns, side by side over one window.
 *
 * The single-shop dashboard answers "how is this shop doing?"; an owner with several shops has
 * a question no in-shop screen can reach — which of them is actually earning. So this reads the
 * same numbers for all of them at once and puts them in one order: best earner first, with each
 * shop's own card carrying the way into it. It sits outside the app shell alongside the picker,
 * because it belongs to choosing a shop, not to working inside one.
 *
 * Owned shops only (the backend filters); a shop shared *with* this user is someone else's
 * business. Closed shops stay in — a shop the plan shut is exactly the sort a comparison is
 * meant to inform a decision about.
 */
@Component({
  selector: 'app-store-compare',
  imports: [RouterLink, OuterBar, ChartView, DateField, AmountLegend],
  templateUrl: './store-compare.html',
  styleUrl: './store-compare.css',
})
export class StoreCompare {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(DashboardService);
  private readonly theme = inject(ThemeService);

  /** Same default window as the dashboard, carried in the URL so Back walks it back. */
  protected readonly filters = urlFilters({ from: daysAgoIso(6), to: todayIso() });

  protected readonly rows = signal<StoreComparison[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  private readonly palette = computed(() => PALETTES[this.theme.resolved()]);

  /**
   * Best earner first. The ranking *is* the answer to "which shop is making the money", so it
   * is the page's order rather than a number printed on each card — and the chart's colours
   * are assigned from this same order, so a line and its card always match.
   */
  protected readonly ranked = computed(() =>
    [...this.rows()].sort((a, b) => b.dashboard.sales - a.dashboard.sales),
  );

  /** The account's books added up: the same five numbers each shop shows, for all of them. */
  protected readonly totals = computed(() =>
    this.rows().reduce(
      (sum, row) => ({
        sales: sum.sales + row.dashboard.sales,
        spend: sum.spend + row.dashboard.spend,
        cash: sum.cash + row.dashboard.cashPosition,
        receivables: sum.receivables + row.dashboard.receivablesTotal,
        payables: sum.payables + row.dashboard.payablesTotal,
      }),
      { sales: 0, spend: 0, cash: 0, receivables: 0, payables: 0 },
    ),
  );

  /** True once loaded with nothing recorded anywhere — the window, not the account, is empty. */
  protected readonly isEmpty = computed(
    () => this.rows().length > 0 && this.totals().sales === 0 && this.totals().spend === 0,
  );

  /** One revenue line per shop over the window, coloured by rank. */
  protected readonly revenueConfig = computed<ChartConfiguration>(() => {
    const pal = this.palette();
    const rows = this.ranked();
    const rtl = this.locale.dir() === 'rtl';
    // Every shop is read over the same window, so any one of them supplies the day labels.
    const days = rows[0]?.dashboard.daily ?? [];
    return {
      type: 'line',
      data: {
        labels: days.map((p) => shortDate(p.date, this.locale.locale())),
        datasets: rows.map((row, i) => {
          const color = this.colorAt(i);
          return {
            label: row.store.name,
            data: row.dashboard.daily.map((p) => p.sales),
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: color,
            pointBorderColor: pal.card,
            pointBorderWidth: 1.5,
          };
        }),
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
              callback: (v) => compactMoney(Number(v)),
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

  constructor() {
    // Refetch whenever the window changes — a picked date, or a Back/Forward that restored an
    // earlier one. Runs once on init.
    effect(() => {
      void this.load(this.filters.from(), this.filters.to());
    });
  }

  async load(from = this.filters.from(), to = this.filters.to()): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.rows.set(await this.api.compare(from, to));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** A shop's line colour, by its rank. Cycles — the plan caps shops well inside the palette. */
  protected colorAt(index: number): string {
    const mix = this.palette().mix;
    return mix[index % mix.length];
  }

  /** A shop's share of the window's total revenue, for the hint on its card. */
  protected sharePct(row: StoreComparison): number {
    const total = this.totals().sales;
    return total > 0 ? Math.round((row.dashboard.sales / total) * 100) : 0;
  }

  /** Bar-fill width for a top-item row, against the largest seller *in that shop*. */
  protected itemPct(row: StoreComparison, revenue: number): number {
    const max = Math.max(1, ...row.dashboard.topItems.map((i) => i.revenue));
    return Math.round((revenue / max) * 100);
  }

  /** A plain-language sentence of the chart's numbers, for screen readers. */
  protected revenueLabel(): string {
    const leader = this.ranked()[0];
    if (!leader) {
      return '';
    }
    return this.locale.t('compare.chart.aria', {
      name: leader.store.name,
      amount: this.locale.money(leader.dashboard.sales),
      count: this.rows().length + '',
    });
  }
}
