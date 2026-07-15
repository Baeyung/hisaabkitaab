import { Component } from '@angular/core';
import { Placeholder } from '../../shared/placeholder/placeholder';

@Component({
  selector: 'app-purchase',
  imports: [Placeholder],
  template: `<app-placeholder titleKey="nav.purchase" />`,
})
export class Purchase {}
