import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DateField } from './date-field';

@Component({
  template: `<app-date-field [value]="value()" (valueChange)="value.set($event)" />`,
  imports: [DateField],
})
class Host {
  readonly value = signal('2026-09-04');
}

describe('DateField typed mask', () => {
  let fx: ComponentFixture<Host>;
  let field: HTMLInputElement;

  /** Sends each key to the mask the way the keyboard would. */
  function press(...keys: string[]): void {
    for (const key of keys) {
      field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    fx.detectChanges();
  }

  /** The span the mask has highlighted, as `start-end`. */
  function selection(): string {
    return `${field.selectionStart}-${field.selectionEnd}`;
  }

  beforeEach(() => {
    fx = TestBed.createComponent(Host);
    fx.detectChanges();
    fx.nativeElement.querySelector('.df__btn').click();
    fx.detectChanges();
    field = fx.nativeElement.querySelector('.df__type');
  });

  it('opens prefilled with the selected day highlighted', () => {
    expect(field.value).toBe('04/09/2026');
    expect(selection()).toBe('0-2');
  });

  it('fills day, month and year from digits alone', () => {
    press('1', '5', '1', '1', '2', '0', '2', '7');
    expect(field.value).toBe('15/11/2027');

    press('Enter');
    expect(fx.componentInstance.value()).toBe('2027-11-15');
  });

  it('hands over as soon as a segment is full', () => {
    press('7'); // no day starts with 7, so the day is done
    expect(field.value).toBe('07/09/2026');
    expect(selection()).toBe('3-5');
  });

  it('restarts a segment a second digit would overflow', () => {
    press('1', '2', '1', '3'); // 13 is no month, so the 3 opens it again
    expect(field.value).toBe('12/03/2026');
  });

  it('steps between segments with the arrows and the separator', () => {
    press('ArrowRight');
    expect(selection()).toBe('3-5');
    press('/');
    expect(selection()).toBe('6-10');
    press('ArrowLeft');
    expect(selection()).toBe('3-5');
  });
});
