import { Component } from '@angular/core';
import { Placeholder } from '../../shared/placeholder/placeholder';

@Component({
  selector: 'app-receipt',
  imports: [Placeholder],
  template: `<app-placeholder titleKey="nav.receipt" />`,
})
export class Receipt {}
