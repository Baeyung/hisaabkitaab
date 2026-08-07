import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { disabled, form, FormField } from '@angular/forms/signals';
import { PhoneField } from './phone-field';

/** A shared (non-owner) user can read the shop's phone but not change it —
 *  settings/general disables the field through the form schema, and the control
 *  has to carry that down to both of its inner elements, not just one. */
@Component({
  imports: [FormField, PhoneField],
  template: `<app-phone-field [formField]="f.contact" />`,
})
class Host {
  readonly isOwner = signal(false);
  readonly model = signal({ contact: '923001234567' });
  readonly f = form(this.model, (path) => {
    disabled(path.contact, () => !this.isOwner());
  });
}

describe('PhoneField disabled state', () => {
  it('locks both the country select and the number box, and unlocks with ownership', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();

    const select = (): HTMLSelectElement => fixture.nativeElement.querySelector('select');
    const input = (): HTMLInputElement => fixture.nativeElement.querySelector('input');

    expect(select().disabled).toBe(true);
    expect(input().disabled).toBe(true);

    fixture.componentInstance.isOwner.set(true);
    await fixture.whenStable();

    expect(select().disabled).toBe(false);
    expect(input().disabled).toBe(false);
  });

  it('splits the stored number into country and subscriber parts', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('select').value).toBe('92');
    expect(fixture.nativeElement.querySelector('input').value).toBe('3001234567');
  });
});
