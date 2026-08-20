import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DevToolsService } from '../../core/dev/dev-tools.service';
import { PartyService } from '../../core/store/party.service';
import { StoreService } from '../../core/store/store.service';
import { DateField } from '../date-field/date-field';
import { Select, SelectOption } from '../select/select';
import { todayIso } from '../date.util';

/** One PDF that came back, kept so the panel can offer it again after the tab is closed. */
interface Rendered {
  label: string;
  url: string;
}

/**
 * The floating gear: the two scheduled reports, on demand.
 *
 * Daily reports go out at the shop's chosen minute and khata statements once a month, which is
 * a slow way to look at a layout change — this renders either one for any date, through the
 * same backend path the scheduler uses, and opens the PDF. Nothing is sent to anybody and no
 * quota is spent; see `DevToolsController`. When `PDF_DUMP_DIR` is set (the compose file mounts
 * `./pdf-dumps` for it) a copy lands there too, which is the more useful half when the layout
 * being debugged is print-only.
 *
 * Mounted in the shell but rendered only when `localStorage.devtools === 'true'` — the shell's
 * `@if` drops it entirely otherwise, so a shopkeeper never carries the party list or the panel
 * around. It lives inside the shell rather than at the app root because both reports are about
 * one shop, and the shell is where a shop has been selected.
 *
 * Deliberately untranslated. Every string here is for whoever is debugging the app, which is
 * us; putting them through `LocaleService` would put developer wording in front of translators
 * and grow `en.ts`/`ur.ts` for screens no shopkeeper opens.
 */
@Component({
  selector: 'app-dev-tools',
  imports: [DateField, Select],
  templateUrl: './dev-tools.html',
  styleUrl: './dev-tools.css',
  host: { '(document:keydown.escape)': 'panel.set(false)' },
})
export class DevTools implements OnDestroy {
  private readonly dev = inject(DevToolsService);
  private readonly parties = inject(PartyService);
  private readonly stores = inject(StoreService);

  protected readonly panel = signal(false);
  protected readonly date = signal(todayIso());
  protected readonly partyId = signal('');
  /** What is being rendered right now, if anything — the renderer can take the better part of a minute. */
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  /** Newest first, so the last thing rendered is the first thing offered. */
  protected readonly rendered = signal<Rendered[]>([]);

  private readonly partyList = signal<SelectOption[] | null>(null);

  protected readonly partyOptions = computed(() => this.partyList() ?? []);
  protected readonly storeName = computed(() => this.stores.current()?.name ?? '');

  async toggle(): Promise<void> {
    const open = !this.panel();
    this.panel.set(open);

    // Loaded on first open rather than at startup: with the flag off this component never
    // exists, and with it on there is still no reason to fetch a party list nobody has asked
    // to see. Left in place afterwards — a khata added mid-session is what reopening is for.
    if (open && this.partyList() === null) {
      const parties = await this.parties.list();
      this.partyList.set(
        parties
          .map((party) => ({ value: party.id, label: party.name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      );
    }
  }

  daily(): Promise<void> {
    return this.render(`Daily report · ${this.date()}`, () => this.dev.daily(this.date()));
  }

  reminder(): Promise<void> {
    const id = this.partyId();
    if (!id) return Promise.resolve();

    const name = this.partyOptions().find((option) => option.value === id)?.label ?? id;

    return this.render(`Khata · ${name} · ${this.date()}`, () => this.dev.reminder(id, this.date()));
  }

  /**
   * Render one report and put it in front of whoever asked.
   *
   * The new tab is attempted but never relied on: the PDF arrives after an await long enough
   * that a browser no longer counts the click as the thing that opened it, so a blocked popup
   * is normal rather than exceptional. Every render is listed in the panel either way, which
   * is also what makes two renders comparable side by side.
   */
  private async render(label: string, run: () => Promise<Blob>): Promise<void> {
    if (this.busy()) return;

    this.busy.set(label);
    this.error.set(null);
    try {
      const url = URL.createObjectURL(await run());
      this.rendered.update((list) => [{ label, url }, ...list]);
      window.open(url, '_blank');
    } catch (e) {
      this.error.set(await message(e));
    } finally {
      this.busy.set(null);
    }
  }

  ngOnDestroy(): void {
    // These hold the PDF bytes in memory for as long as the document lives; navigating away
    // from the shell (signing out, switching shops) is where they stop being anybody's.
    for (const item of this.rendered()) URL.revokeObjectURL(item.url);
  }
}

/**
 * What went wrong, in words. These calls ask for a blob, so an error body arrives as one too —
 * `HttpClient` does not parse the JSON it would have on any other request, and a panel showing
 * "[object Blob]" would send someone to the network tab for something the server already said.
 */
async function message(e: unknown): Promise<string> {
  if (!(e instanceof HttpErrorResponse)) return String(e);

  let body = '';
  try {
    body = e.error instanceof Blob ? await e.error.text() : '';
    const parsed = body ? JSON.parse(body) : null;
    if (parsed?.message) return `${e.status}: ${parsed.message}`;
  } catch {
    // Not JSON — an nginx error page, or a timeout with no body at all. Fall through.
  }

  return `${e.status || 'Network'}: ${body.slice(0, 300) || e.message}`;
}
