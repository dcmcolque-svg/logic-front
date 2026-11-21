import { Component, provideZonelessChangeDetection } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { FormsModule } from '@angular/forms'
import { InputNumber } from 'primeng/inputnumber'
import { applyInputNumberLocale, normalizePastedNumber, restoreInputNumberLocale } from './input-number-locale'

@Component({
  standalone: true,
  imports: [FormsModule, InputNumber],
  template: `
    <p-inputnumber id="dec" [(ngModel)]="amount" [minFractionDigits]="2" [maxFractionDigits]="2" />
    <p-inputnumber id="own" [(ngModel)]="amount" locale="en-US" [minFractionDigits]="2" [maxFractionDigits]="2" />
    <p-inputnumber id="typed" [(ngModel)]="typed" [maxFractionDigits]="2" />
    <p-inputnumber id="pasted" [(ngModel)]="pasted" [maxFractionDigits]="2" />
    <p-inputnumber id="units" [(ngModel)]="units" [maxFractionDigits]="0" />
  `,
})
class HostComponent {
  amount: number | null = 1234.5
  typed: number | null = null
  pasted: number | null = null
  units: number | null = null
}

describe('applyInputNumberLocale', () => {
  let fixture: ComponentFixture<HostComponent>
  const input = (id: string) => fixture.nativeElement.querySelector(`#${id} input`) as HTMLInputElement

  function type(id: string, text: string): void {
    const el = input(id)
    el.focus()
    for (const ch of text) {
      el.setSelectionRange(el.value.length, el.value.length)
      el.dispatchEvent(
        new KeyboardEvent('keypress', {
          key: ch,
          keyCode: ch.charCodeAt(0),
          which: ch.charCodeAt(0),
          bubbles: true,
          cancelable: true,
        } as KeyboardEventInit)
      )
    }
  }

  function paste(id: string, text: string): void {
    const el = input(id)
    el.focus()
    el.setSelectionRange(0, el.value.length)
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', text)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  }

  beforeAll(() => applyInputNumberLocale('es-BO'))
  afterAll(() => restoreInputNumberLocale())

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents()
    fixture = TestBed.createComponent(HostComponent)
    await settle()
  })

  async function settle(): Promise<void> {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  it('writes the value in the display locale', () => {
    expect(input('dec').value).toBe('1.234,50')
  })

  it('keeps an explicit [locale]', () => {
    expect(input('own').value).toBe('1,234.50')
  })

  it('takes "." as the decimal sign', async () => {
    type('typed', '10.5')
    await settle()
    expect(fixture.componentInstance.typed as number | null).toBe(10.5)
    expect(input('typed').value).toBe('10,5')
  })

  it('reads a pasted number in either style', async () => {
    paste('pasted', '1,234.5')
    await settle()
    expect(fixture.componentInstance.pasted as number | null).toBe(1234.5)
    paste('pasted', 'Bs 1.234,56')
    await settle()
    expect(fixture.componentInstance.pasted as number | null).toBe(1234.56)
  })

  it('reads a pasted "1,234" as thousands in an integer input', async () => {
    paste('units', '1,234')
    await settle()
    expect(fixture.componentInstance.units as number | null).toBe(1234)
  })
})

describe('normalizePastedNumber', () => {
  const es = (text: string, maxFraction?: number) => normalizePastedNumber(text, ',', maxFraction)
  const en = (text: string, maxFraction?: number) => normalizePastedNumber(text, '.', maxFraction)

  it('takes the last sign as decimal when both are present', () => {
    expect(es('1,234.5')).toBe('1234,5')
    expect(es('1.234,5')).toBe('1234,5')
    expect(es('1,234,567.89')).toBe('1234567,89')
    expect(en('1.234.567,89')).toBe('1234567.89')
  })

  it('takes a repeated sign as thousands', () => {
    expect(es('1.234.567')).toBe('1234567')
    expect(es('1,234,567')).toBe('1234567')
  })

  it('takes a single sign not followed by 3 digits as decimal', () => {
    expect(es('10.5')).toBe('10,5')
    expect(es('10,50')).toBe('10,50')
    expect(en('10,5')).toBe('10.5')
    expect(es('.5')).toBe('0,5')
  })

  it('reads "1.234" / "1,234" by the input', () => {
    // Fewer than 3 decimals allowed: thousands.
    expect(es('1,234', 2)).toBe('1234')
    expect(es('1.234', 2)).toBe('1234')
    // 3 or more: as the input's locale writes it.
    expect(es('1,234', 4)).toBe('1,234')
    expect(es('1.234', 4)).toBe('1234')
    expect(en('1.234', 4)).toBe('1.234')
    expect(en('1,234', 4)).toBe('1234')
  })

  it('drops decimals in an integer input', () => {
    expect(normalizePastedNumber('10.5', '', 0)).toBe('10')
    expect(normalizePastedNumber('1.234', '', 0)).toBe('1234')
  })

  it('strips currency, units, spaces and keeps the minus', () => {
    expect(es('US$ 3.00')).toBe('3,00')
    expect(es('CLP$ 1.250', 0)).toBe('1250')
    expect(es('12,5 %')).toBe('12,5')
    expect(es('1 234,5')).toBe('1234,5')
    expect(es('-1,234.5')).toBe('-1234,5')
  })

  it('returns null for text that is not a number', () => {
    expect(es('abc')).toBeNull()
    expect(es('12abc34')).toBeNull()
    expect(es('')).toBeNull()
    expect(es('.,')).toBeNull()
  })
})
