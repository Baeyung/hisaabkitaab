import { Component } from '@angular/core';
import { Placeholder } from '../../shared/placeholder/placeholder';

@Component({
  selector: 'app-expense',
  imports: [Placeholder],
  template: `<app-placeholder titleKey="nav.expense" />`,
})
export class Expense {}
