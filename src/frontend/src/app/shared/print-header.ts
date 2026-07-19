import { Component, computed, inject } from '@angular/core';
import { StoreService } from '../core/store/store.service';

/**
 * The shop's letterhead, shown only on the printed page (cashbook, ledger,
 * statements). Reads the owner's first store — already loaded by storeGuard on
 * every guarded route — for the name/address/contact plus the optional base64
 * logo and watermark. Plain <img> (not NgOptimizedImage) because the URIs are
 * inline base64. Hidden on screen via :host; the page's own header carries the
 * on-screen title.
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
    }
  `,
})
export class PrintHeader {
  private readonly stores = inject(StoreService);
  protected readonly store = computed(() => this.stores.stores()?.[0] ?? null);
}
