import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  constructor() {
    // ngsw keeps serving the cached build to already-open tabs until every one is
    // closed, so a deployed fix can sit live but never reach a tab you left open.
    // Reload as soon as the new version has finished downloading.
    inject(SwUpdate)
      .versionUpdates.pipe(filter((e) => e.type === 'VERSION_READY'))
      .subscribe(() => location.reload());
  }
}
