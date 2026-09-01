import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

/** Renders the app-wide toast stack; mounted once in the app shell. */
@Component({
  selector: 'app-toast-host',
  template: `
    <div class="toast-stack">
      @for (t of toast.toasts(); track t.id) {
        <button
          type="button"
          class="toast toast--{{ t.kind }}"
          role="status"
          aria-live="polite"
          (click)="toast.dismiss(t.id)"
        >
          {{ t.text }}
        </button>
      }
    </div>
  `,
  styles: `
    /* inset-inline-end so it hugs the reading edge in Urdu too, and a max-width
       the viewport can actually hold — 340px plus its offset overhangs a 320px
       phone. Stacks bottom-up so a newer toast doesn't shove an older one under
       the thumb mid-read. */
    .toast-stack {
      position: fixed;
      bottom: 20px;
      inset-inline-end: 20px;
      z-index: 1000;
      display: flex;
      flex-direction: column-reverse;
      gap: 8px;
      align-items: flex-end;
    }
    .toast {
      max-width: min(340px, calc(100vw - 40px));
      padding: 12px 16px;
      border: none;
      border-radius: 10px;
      font: inherit;
      font-size: 13.5px;
      font-weight: 600;
      text-align: start;
      color: var(--kg-on-out);
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      animation: toast-in 160ms ease-out;
    }
    .toast--error {
      background: var(--kg-out-solid);
    }
    .toast--success {
      background: var(--kg-in-solid);
      color: var(--kg-on-in);
    }
    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .toast {
        animation: none;
      }
    }
  `,
})
export class ToastHost {
  protected readonly toast = inject(ToastService);
}
