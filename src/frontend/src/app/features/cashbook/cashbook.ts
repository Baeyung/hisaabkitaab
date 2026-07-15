import { Component } from '@angular/core';
import { Placeholder } from '../../shared/placeholder/placeholder';

@Component({
  selector: 'app-cashbook',
  imports: [Placeholder],
  template: `<app-placeholder titleKey="nav.cashbook" />`,
})
export class Cashbook {}
