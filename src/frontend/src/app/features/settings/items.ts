import { Component } from '@angular/core';
import { Placeholder } from '../../shared/placeholder/placeholder';

@Component({
  selector: 'app-items',
  imports: [Placeholder],
  template: `<app-placeholder titleKey="nav.settings.items" />`,
})
export class SettingsItems {}
