import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Combobox } from './combobox';

@Component({
  template: `
    <app-combobox [options]="options" [value]="value()" (valueChange)="value.set($event)" />
  `,
  imports: [Combobox],
})
class Host {
  readonly options = ['Chamki', 'Chandni', 'Lawn'];
  readonly value = signal('');
}

/** Types `text` into the combobox and presses Enter; returns what the host holds. */
function typeThenEnter(fx: ComponentFixture<Host>, text: string): string {
  const el: HTMLInputElement = fx.nativeElement.querySelector('input');
  el.value = text;
  el.dispatchEvent(new Event('input'));
  fx.detectChanges();
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  fx.detectChanges();
  return fx.componentInstance.value();
}

describe('Combobox', () => {
  let fx: ComponentFixture<Host>;

  // The test DOM has no layout, so it ships no scrollIntoView; the keep-active-
  // option-visible effect calls it on every highlight.
  Element.prototype.scrollIntoView ??= () => {};

  beforeEach(() => {
    fx = TestBed.createComponent(Host);
    fx.detectChanges();
  });

  it('Enter takes the first match', () => {
    expect(typeThenEnter(fx, 'cha')).toBe('Chamki');
  });

  it('Enter keeps the raw string when nothing matches', () => {
    expect(typeThenEnter(fx, 'Boski')).toBe('Boski');
  });

  // The list is position:fixed and anchored from the input's rect, so it can
  // escape <main>'s scroll box and flip above the field near a phone's bottom
  // edge. Without the inline coords it renders pinned to the viewport corner.
  it('anchors the open list to the input', () => {
    const el: HTMLInputElement = fx.nativeElement.querySelector('input');
    el.dispatchEvent(new Event('focus'));
    fx.detectChanges();

    const list: HTMLElement = fx.nativeElement.querySelector('[role="listbox"]');
    expect(list.style.top).not.toBe('');
    expect(list.style.left).not.toBe('');
  });
});
