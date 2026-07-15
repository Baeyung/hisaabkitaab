import { Component } from '@angular/core';
import { Placeholder } from '../../shared/placeholder/placeholder';

@Component({
  selector: 'app-general',
  imports: [Placeholder],
  template: `<app-placeholder titleKey="nav.settings.general" />`,
})
export class SettingsGeneral {}
