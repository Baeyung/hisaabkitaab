import { Signal, WritableSignal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * A screen's filters, held in the query string instead of in the component.
 *
 * Read one as `filters.from()`. Writing goes through {@link set}, which is a
 * router navigation — so the browser's Back button walks the ranges back, and
 * a copied URL opens on the view it was copied from. {@link replace} writes
 * the same way without leaving a history entry, for the changes a user would
 * not think of as steps: keystrokes in a search box, or a default that can
 * only be worked out once the data has loaded.
 */
export type UrlFilters<K extends string> = { readonly [P in K]: Signal<string> } & {
  set(key: K, value: string): void;
  replace(values: Partial<Record<K, string>>): void;
};

/**
 * Bind a set of filters to the URL, given each one's default:
 * `urlFilters({ from: todayIso(), to: todayIso() })`. Call it in a field
 * initialiser — it injects, and subscribes for the component's lifetime.
 *
 * The URL is the state: every navigation, ours or a Back/Forward, flows
 * through `queryParamMap` into the signals. A filter sitting at its default is
 * left out of the query string, so "no params" keeps meaning "the screen as it
 * first opened" — which is what makes stepping Back past every change land
 * somewhere sane. Other params (e.g. the dashboard's `?new`) are merged
 * through untouched.
 */
export function urlFilters<K extends string>(defaults: Record<K, string>): UrlFilters<K> {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const keys = Object.keys(defaults) as K[];

  const signals = {} as Record<K, WritableSignal<string>>;
  const initial = route.snapshot.queryParamMap;
  for (const key of keys) {
    signals[key] = signal(initial.get(key) ?? defaults[key]);
  }

  route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
    for (const key of keys) {
      signals[key].set(params.get(key) ?? defaults[key]);
    }
  });

  const write = (values: Partial<Record<K, string>>, replaceUrl: boolean): void => {
    const queryParams: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(values) as [K, string][]) {
      // Set now rather than waiting for the navigation to come back round
      // through the subscription: the control would lag a tick otherwise.
      signals[key].set(value);
      queryParams[key] = value === defaults[key] ? null : value;
    }
    void router.navigate([], {
      relativeTo: route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  };

  return {
    ...signals,
    set: (key: K, value: string) => write({ [key]: value } as Partial<Record<K, string>>, false),
    replace: (values: Partial<Record<K, string>>) => write(values, true),
  } as UrlFilters<K>;
}
