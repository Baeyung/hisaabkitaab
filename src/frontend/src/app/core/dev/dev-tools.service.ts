import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StoreService } from '../store/store.service';

/** The localStorage key that puts the gear on screen. Set it to `true` and reload. */
export const DEV_TOOLS_KEY = 'devtools';

/**
 * The switch behind the floating gear, and the calls it makes.
 *
 * Off unless `localStorage.devtools === 'true'`, which is the whole of the gate on this side.
 * A flag anyone can set in their own browser is not a security boundary and is not meant to be
 * one — every endpoint below is owner-scoped on the backend and hands back a document the
 * shop's own owner would have been sent anyway (see `DevToolsController`). What the flag buys
 * is that a shopkeeper never sees a gear they have no use for.
 *
 * Read once, at startup. Setting the key mid-session and reloading is the whole ritual, and
 * watching localStorage for it would mean the panel could appear in a tab nobody asked in.
 */
@Injectable({ providedIn: 'root' })
export class DevToolsService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  /** Whether the gear shows. A signal so the shell can drop the whole component when off. */
  readonly enabled = signal(read());

  /**
   * The daily store report for `date`, as PDF bytes.
   *
   * The backend renders it exactly as the 21:00 job would — same page, same token, same
   * headless Chrome — and drops a copy in `app.pdf.dump-dir` on the way past, so with the
   * compose volume mounted this also lands in `./pdf-dumps` without anything being saved here.
   */
  daily(date: string): Promise<Blob> {
    return this.pdf(this.stores.api('dev/reports/daily'), date);
  }

  /** One party's khata statement, as the monthly reminder run would have sent it to them. */
  reminder(partyId: string, date: string): Promise<Blob> {
    return this.pdf(this.stores.api(`dev/reports/reminder/${partyId}`), date);
  }

  private pdf(url: string, date: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(url, { params: { date }, responseType: 'blob' }),
    );
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(DEV_TOOLS_KEY) === 'true';
  } catch {
    // Storage can be walled off entirely (private mode, an embedded webview). No gear, then.
    return false;
  }
}
