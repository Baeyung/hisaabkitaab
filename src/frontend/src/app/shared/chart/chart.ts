import { Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

/**
 * Thin wrapper around a chart.js canvas. Kept deliberately dumb: pass a full
 * chart.js config in, it draws and redraws when the config changes, and cleans
 * up the instance on destroy. No PrimeNG (its Chart needs a paid license key,
 * see app.config.ts) — chart.js is free and drawn directly.
 *
 * A canvas is invisible to screen readers, so the caller MUST pass `label`
 * with the same numbers the chart shows; the visual is decoration over it.
 */
@Component({
  selector: 'app-chart',
  template: `<canvas #canvas role="img" [attr.aria-label]="label()"></canvas>`,
  styles: `
    :host {
      display: block;
      position: relative;
      width: 100%;
    }
  `,
})
export class ChartView implements OnDestroy {
  readonly config = input.required<ChartConfiguration>();
  readonly label = input('');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    effect(() => {
      const config = this.config();
      this.chart?.destroy();
      this.chart = new Chart(this.canvas().nativeElement, config);
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
