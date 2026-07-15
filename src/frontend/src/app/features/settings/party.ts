import { Component } from '@angular/core';
import { Placeholder } from '../../shared/placeholder/placeholder';

@Component({
  selector: 'app-party',
  imports: [Placeholder],
  template: `<app-placeholder titleKey="nav.settings.party" />`,
})
export class SettingsParty {}
