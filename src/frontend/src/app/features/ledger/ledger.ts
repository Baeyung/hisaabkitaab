import { Component } from '@angular/core';
import { Placeholder } from '../../shared/placeholder/placeholder';

@Component({
  selector: 'app-ledger',
  imports: [Placeholder],
  template: `<app-placeholder titleKey="nav.ledger" />`,
})
export class Ledger {}
