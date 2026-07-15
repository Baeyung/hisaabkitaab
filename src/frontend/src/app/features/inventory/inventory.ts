import { Component } from '@angular/core';
import { Placeholder } from '../../shared/placeholder/placeholder';

@Component({
  selector: 'app-inventory',
  imports: [Placeholder],
  template: `<app-placeholder titleKey="nav.inventory" />`,
})
export class Inventory {}
