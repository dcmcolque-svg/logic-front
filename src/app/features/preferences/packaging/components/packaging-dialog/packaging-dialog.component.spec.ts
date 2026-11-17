import { provideZonelessChangeDetection } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { FormGroup } from '@angular/forms'
import { provideTranslateService } from '@ngx-translate/core'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { of } from 'rxjs'

import { PackagingDialogComponent } from './packaging-dialog.component'
import { PackagingService } from '../../packaging.service'
import { FacilitiesService } from '../../../facilities/facilities.service'
import { MessageEdgeService } from '../../../../../core/services/message.service'

const MAX_QTY = 9_999_999_999

describe('PackagingDialogComponent · qty limit (create mode)', () => {
    let fixture: ComponentFixture<PackagingDialogComponent>
    let form: FormGroup
    let packagingSpy: jasmine.SpyObj<PackagingService>

    const host = (): HTMLElement => fixture.nativeElement
    const qtyInput = () => host().querySelector<HTMLInputElement>('p-inputnumber[formcontrolname="qty"] input')!
    const incrementButton = () =>
        host().querySelector<HTMLElement>('p-inputnumber[formcontrolname="qty"] .p-inputnumber-increment-button')!

    /** Types each character at the end of the input, as a user would. */
    function type(text: string): void {
        const input = qtyInput()
        input.focus()
        for (const ch of text) {
            input.setSelectionRange(input.value.length, input.value.length)
            input.dispatchEvent(new KeyboardEvent('keypress', {
                key: ch,
                keyCode: ch.charCodeAt(0),
                which: ch.charCodeAt(0),
                bubbles: true,
                cancelable: true,
            } as KeyboardEventInit))
        }
    }

    async function blur(): Promise<void> {
        qtyInput().dispatchEvent(new Event('blur'))
        await fixture.whenStable()
    }

    beforeEach(async () => {
        packagingSpy = jasmine.createSpyObj<PackagingService>('PackagingService', [
            'listContainerProfiles',
            'createPackaging',
        ])
        packagingSpy.listContainerProfiles.and.returnValue(
            of({ data: [], meta_data: { total_records: 0, page: 1, rows: 50 } }),
        )
        const facilitiesSpy = jasmine.createSpyObj<FacilitiesService>('FacilitiesService', ['getFacilities'])
        facilitiesSpy.getFacilities.and.returnValue(
            of({ data: [], meta_data: { total_records: 0, page: 1, rows: 1000 } }),
        )

        await TestBed.configureTestingModule({
            imports: [PackagingDialogComponent],
            providers: [
                provideZonelessChangeDetection(),
                provideTranslateService(),
                { provide: DynamicDialogRef, useValue: jasmine.createSpyObj('DynamicDialogRef', ['close']) },
                { provide: DynamicDialogConfig, useValue: { data: {} } },
                { provide: PackagingService, useValue: packagingSpy },
                { provide: FacilitiesService, useValue: facilitiesSpy },
                { provide: MessageEdgeService, useValue: jasmine.createSpyObj('MessageEdgeService', ['showSuccess', 'showError']) },
            ],
        }).compileComponents()

        fixture = TestBed.createComponent(PackagingDialogComponent)
        document.body.appendChild(fixture.nativeElement)
        await fixture.whenStable()
        form = fixture.componentInstance.form
    })

    afterEach(() => {
        fixture.destroy()
        fixture.nativeElement.remove()
    })

    it('accepts a 10-digit quantity typed by the user', async () => {
        type('9999999999')
        await blur()

        expect(form.get('qty')!.value).toBe(MAX_QTY)
        expect(form.get('qty')!.valid).toBeTrue()
        expect(qtyInput().value).toBe('9,999,999,999')
    })

    it('keeps a typed quantity above the limit and flags it instead of clamping', async () => {
        type('12345678901')
        await blur()

        expect(form.get('qty')!.value).toBe(12_345_678_901)
        expect(form.get('qty')!.hasError('max')).toBeTrue()
        expect(qtyInput().value).toBe('12,345,678,901')
    })

    it('keeps a pasted quantity above the limit and shows the max error', async () => {
        const clipboardData = new DataTransfer()
        clipboardData.setData('Text', '98765432109')
        qtyInput().focus()
        qtyInput().dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
        await blur()
        fixture.detectChanges()

        expect(form.get('qty')!.value).toBe(98_765_432_109)
        expect(qtyInput().value).toBe('98,765,432,109')
        expect(fixture.componentInstance.isInvalid('qty')).toBeTrue()
        expect(fixture.componentInstance.getFieldError('qty')).toBe('forms_validation.max_value')
    })

    it('does not save while the quantity is above the limit', () => {
        form.get('qty')!.setValue(MAX_QTY + 1)

        fixture.componentInstance.onSave()

        expect(packagingSpy.createPackaging).not.toHaveBeenCalled()
    })

    it('flags a quantity above the limit as invalid', () => {
        const qty = form.get('qty')!

        qty.setValue(MAX_QTY + 1)
        expect(qty.hasError('max')).toBeTrue()

        qty.setValue(MAX_QTY)
        expect(qty.hasError('max')).toBeFalse()
    })

    it('keeps the "+" button enabled and incrementing the quantity', async () => {
        type('5')
        await blur()

        const button = incrementButton()
        expect(button.classList).not.toContain('p-disabled')
        expect(getComputedStyle(button).pointerEvents).not.toBe('none')

        button.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))
        button.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }))
        await fixture.whenStable()

        expect(form.get('qty')!.value).toBe(6)
    })
})
