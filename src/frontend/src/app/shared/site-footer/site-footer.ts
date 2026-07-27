import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The public site footer — brand, contact details, and the legal links.
 * Shared by the /info landing and the policy pages so there is one place to
 * change an address or phone number. Dark by design so it reads as the foot of
 * the page on both the cream policy pages and the dark landing.
 */
@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  template: `
    <footer class="sf">
      <div class="sf__cols">
        <div class="sf__brand">
          <span class="sf__mark">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3.4 2.5h8v19h-8zM12.6 2.5h8v19h-8z" fill="currentColor" />
              <path d="M3.4 5.1h8v2.6h-8zM12.6 5.1h8v2.6h-8z" fill="#c98a2b" />
            </svg>
            HisaabKitaab
          </span>
          <p class="sf__tag">The khaata book that adds itself up.</p>
        </div>

        <div class="sf__group">
          <h2 class="sf__head">Contact</h2>
          <address class="sf__addr">
            321 B WapdaCity, Faisalabad, Pakistan<br />
            <a href="tel:+923394010046">+92 339 4010046</a><br />
            <a href="mailto:support@hisaabkitaab.shop">support&#64;hisaabkitaab.shop</a>
          </address>
        </div>

        <div class="sf__group">
          <h2 class="sf__head">Legal</h2>
          <nav class="sf__links">
            <a routerLink="/privacy-policy">Privacy Policy</a>
            <a routerLink="/terms-and-conditions">Terms &amp; Conditions</a>
          </nav>
        </div>
      </div>

      <p class="sf__copy">© 2026 HisaabKitaab. All rights reserved.</p>
    </footer>
  `,
  styles: `
    .sf {
      background: #17110d;
      color: rgba(240, 233, 220, 0.72);
      padding: clamp(36px, 6vw, 56px) clamp(20px, 5vw, 56px) 24px;
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
      line-height: 1.6;
    }
    .sf__cols {
      display: flex;
      flex-wrap: wrap;
      gap: 36px 64px;
      max-width: 1020px;
      margin: 0 auto;
    }
    .sf__brand {
      flex: 1 1 240px;
    }
    .sf__mark {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      color: #f4ede2;
      font-weight: 600;
      font-size: 17px;
    }
    .sf__mark svg {
      width: 20px;
      height: 20px;
    }
    .sf__tag {
      margin: 12px 0 0;
      max-width: 26ch;
      font-size: 14px;
    }
    .sf__group {
      flex: 0 1 auto;
    }
    .sf__head {
      margin: 0 0 12px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #c98a2b;
    }
    .sf__addr {
      font-style: normal;
      font-size: 14px;
    }
    .sf__links {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sf a {
      color: rgba(240, 233, 220, 0.82);
      text-decoration: none;
    }
    .sf a:hover {
      color: #f4ede2;
      text-decoration: underline;
    }
    .sf a:focus-visible {
      outline: 2px solid #c98a2b;
      outline-offset: 2px;
      border-radius: 2px;
    }
    .sf__copy {
      max-width: 1020px;
      margin: clamp(28px, 5vw, 44px) auto 0;
      padding-top: 18px;
      border-top: 1px solid rgba(240, 233, 220, 0.12);
      font-size: 12.5px;
      color: rgba(240, 233, 220, 0.5);
    }
  `,
})
export class SiteFooter {}
