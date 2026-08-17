import { Component, computed, inject, input } from '@angular/core';
import { StoreService } from '../core/store/store.service';

/** What a letterhead needs to know about a shop — met by both `Store` and `ReportStore`. */
export interface Letterhead {
  name: string;
  address?: string | null;
  contact?: string | null;
  logoUri?: string | null;
  watermarkUri?: string | null;
}

/**
 * The shop's letterhead, shown only on the printed page (cashbook, ledger,
 * statements). Reads the owner's first store — already loaded by storeGuard on
 * every guarded route — for the name/address/contact plus the optional base64
 * logo and watermark. Plain <img> (not NgOptimizedImage) because the URIs are
 * inline base64. Hidden on screen via :host; the page's own header carries the
 * on-screen title.
 *
 * The scheduled report pages pass their shop in through `shop` instead. They are
 * open pages with nobody signed in, so no store has been selected and there is
 * nothing for `StoreService.current()` to return — but a report needs the same
 * letterhead, watermark and brand line as everything else the shop prints, and
 * that is exactly what should not be written out a second time.
 *
 * It also carries the hisaabkitaab mark in the page footer, which is why this
 * sits on every printable screen rather than only the letterheaded ones: a PDF
 * that reaches a customer on WhatsApp should say where it came from, and one
 * component is the only place that has to be true.
 *
 * ponytail: single centred watermark, not tiled per printed page — fine for the
 * one- or two-page runs a shop prints. Revisit if statements grow long.
 */
@Component({
  selector: 'app-print-header',
  template: `
    @if (store(); as s) {
      <header class="pf-head">
        @if (s.logoUri) {
          <img class="pf-logo" [src]="s.logoUri" alt="" />
        }
        <div class="pf-meta">
          <b class="pf-name">{{ s.name }}</b>
          @if (s.address) {
            <span class="pf-line">{{ s.address }}</span>
          }
          @if (s.contact) {
            <span class="pf-line num">{{ s.contact }}</span>
          }
        </div>
      </header>
      @if (s.watermarkUri) {
        <img class="pf-watermark" [src]="s.watermarkUri" alt="" aria-hidden="true" />
      }
      <a class="pf-brand" href="https://hisaabkitaab.shop">hisaabkitaab.shop</a>
    }
  `,
  styles: `
    :host {
      display: none;
    }
    @media print {
      :host {
        display: block;
      }
      .pf-head {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 14px;
        padding-bottom: 12px;
        border-bottom: 2px solid #000;
      }
      .pf-logo {
        height: 56px;
        width: auto;
        object-fit: contain;
      }
      .pf-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .pf-name {
        font-size: 18px;
        font-weight: 700;
      }
      .pf-line {
        font-size: 12px;
      }
      .pf-watermark {
        position: fixed;
        top: 50%;
        left: 50%;
        width: 60%;
        max-width: 420px;
        height: auto;
        transform: translate(-50%, -50%);
        opacity: 0.06;
        z-index: -1;
      }
      /*
       * Fixed, like the watermark, so it lands on every page of a long statement
       * rather than only after the last row.
       *
       * Stays inside the page's content box: Chrome clips a fixed element pushed
       * into the @page margin, and drops it from whole pages when it does. The
       * white ground is what pays for that — on a page whose rows reach the very
       * bottom, this sits over the last row's right edge rather than under it.
       *
       * ponytail: covers a corner sliver on a maximally full page. If that ever
       * bites, widen the @page bottom margin (renderer's page.pdf() margin too)
       * and give this a matching negative offset.
       */
      .pf-brand {
        position: fixed;
        bottom: 0;
        right: 0;
        padding: 2px 0 0 8px;
        background: #fff;
        font-size: 8.5px;
        letter-spacing: 0.03em;
        color: #666;
        text-decoration: none;
      }
    }
  `,
})
export class PrintHeader {
  private readonly stores = inject(StoreService);

  /** The shop to letterhead by, for pages that have one without having selected one. */
  readonly shop = input<Letterhead | null>(null);

  /** The shop whose books are open — a bill must be letterheaded by the shop that issued it. */
  protected readonly store = computed<Letterhead | null>(
    () => this.shop() ?? this.stores.current(),
  );
}
