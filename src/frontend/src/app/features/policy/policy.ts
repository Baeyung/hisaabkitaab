import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { SiteFooter } from '../../shared/site-footer/site-footer';
import { mdToHtml } from '../../shared/mini-md';

/**
 * Renders a policy document (/privacy-policy, /terms-and-conditions). The two
 * routes share this one component and differ only by the `doc` bound from route
 * data. The Markdown source lives in docs/policies and is shipped as a build
 * asset under /policies, so the docs stay the single source of truth — edit the
 * .md and the page follows, no HTML copy to keep in sync.
 */
@Component({
  selector: 'app-policy',
  imports: [RouterLink, SiteFooter],
  templateUrl: './policy.html',
  styleUrl: './policy.css',
})
export class Policy {
  /** Bound from route data: the doc slug, matching its file in /policies. */
  readonly doc = input<string>('');

  private readonly document = inject(DOCUMENT);
  protected readonly html = signal<string | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      const slug = this.doc();
      if (!slug) return;
      this.html.set(null);
      this.failed.set(false);
      this.document.defaultView
        ?.fetch(`policies/${slug}.md`)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then((md) => this.html.set(mdToHtml(md)))
        .catch(() => this.failed.set(true));
    });
  }
}
