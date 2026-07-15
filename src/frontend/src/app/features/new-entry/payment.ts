import { Component } from '@angular/core';
import { Placeholder } from '../../shared/placeholder/placeholder';

@Component({
  selector: 'app-payment',
  imports: [Placeholder],
  template: `<app-placeholder titleKey="nav.payment" />`,
})
export class Payment {}
