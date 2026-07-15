import { Component } from '@angular/core';
import { Placeholder } from '../../shared/placeholder/placeholder';

@Component({
  selector: 'app-sale',
  imports: [Placeholder],
  template: `<app-placeholder titleKey="nav.sale" />`,
})
export class Sale {}
