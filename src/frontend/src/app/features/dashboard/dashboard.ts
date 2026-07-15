import { Component } from '@angular/core';
import { Placeholder } from '../../shared/placeholder/placeholder';

@Component({
  selector: 'app-dashboard',
  imports: [Placeholder],
  template: `<app-placeholder titleKey="nav.dashboard" />`,
})
export class Dashboard {}
