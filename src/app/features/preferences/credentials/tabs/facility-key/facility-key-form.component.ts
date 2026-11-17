import { Component, effect, inject, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { ToastModule } from 'primeng/toast'
import { SelectModule } from 'primeng/select'
import { TranslateLanService } from '../../../../../core/services/translate-lan.service'
import { CredentialsService } from '../../credentials.service'
import { Facility, OperatorKey, CreateApiKeyDto, UpdateApiKeyDto } from '../../credentials.types'
import { FieldErrorComponent, isInvalidCtrl, handleFormError } from '../../../../../shared/components'

@Component({
  selector: 'app-facility-key-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    TranslateModule,
    ToastModule,
    SelectModule,
    FieldErrorComponent,
  ],
  providers: [MessageService],
  template: `
    <form [formGroup]="form" (submit)="save()" class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <label for="facility_id" class="text-sm font-medium">{{
          'labels.facility' | translate
        }}</label>
        <p-select
          [options]="facilities"
          formControlName="facility_id"
          optionLabel="name"
          optionValue="id"
          [showClear]="true"
          [style]="{ width: '100%' }"
          appendTo="body"
        ></p-select>
      </div>

      <div class="flex flex-col gap-2">
        <label for="name" class="text-sm font-medium">{{ 'labels.name' | translate }}</label>
        <input
          pInputText
          id="name"
          formControlName="name"
          class="w-full"
          [class.ng-invalid]="isInvalid('name')"
        />
        <sh-field-error [ctrl]="form.get('name')" />
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <p-button
          (click)="cancel()"
          [label]="'buttons.cancel' | translate"
          severity="secondary"
          [text]="true"
          [disabled]="loading"
        ></p-button>
        <p-button
          type="submit"
          [label]="'buttons.save' | translate"
          [disabled]="!form.valid || loading"
          [loading]="loading"
        ></p-button>
      </div>
      <p-toast></p-toast>
    </form>
  `,
})
export class FacilityKeyFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder)
  private readonly ref = inject(DynamicDialogRef)
  private readonly config = inject(DynamicDialogConfig)
  private readonly svc = inject(CredentialsService)
  private readonly translate = inject(TranslateService)
  private readonly messageService = inject(MessageService)
  private readonly translateLan = inject(TranslateLanService)

  form!: FormGroup
  facilities: Facility[] = []
  loading = false
  obj: OperatorKey | null = null

  constructor() {
    this.obj = (this.config.data?.key as OperatorKey) ?? null

    this.form = this.fb.group({
      name: new FormControl(this.obj?.name ?? '', [Validators.required]),
      facility_id: new FormControl(
        {
          value: this.obj?.facility_id ?? null,
          disabled: !!this.obj?.facility_id,
        },
        Validators.required
      ),
    })

    effect(() => this.translate.use(this.translateLan.changeLanguage()))
  }

  ngOnInit(): void {
    this.facilities = (this.config.data?.facilities as Facility[]) ?? []
  }

  /** Delegate to shared isInvalidCtrl utility */
  isInvalid(field: string): boolean {
    return isInvalidCtrl(this.form.get(field))
  }

  async save(): Promise<void> {
    const nameCtrl = this.form.get('name')
    if (nameCtrl?.value) nameCtrl.setValue(nameCtrl.value.trim())

    if (!this.form.valid) return

    this.loading = true
    const formValue = this.form.getRawValue()

    if (this.obj?.id) {
      // Update: backend only accepts name
      const dto: UpdateApiKeyDto = { name: formValue.name }
      this.svc.updateKey(this.obj.id, dto).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('common.success'),
            detail: this.translate.instant('messages.update_success'),
          })
          this.ref.close(true)
        },
        error: (err: any) => {
          this.loading = false
          handleFormError(err, this.form, this.translate)
        },
        complete: () => { this.loading = false },
      })
    } else {
      // Create: send name + facility_id (backend sets operator from JWT)
      const dto: CreateApiKeyDto = {
        name: formValue.name,
        facility_id: formValue.facility_id || undefined,
      }
      this.svc.createKey(dto).subscribe({
        next: (created: OperatorKey) => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('common.success'),
            detail: this.translate.instant('messages.create_success'),
          })
          this.ref.close(created)
        },
        error: (err: any) => {
          this.loading = false
          handleFormError(err, this.form, this.translate)
        },
        complete: () => { this.loading = false },
      })
    }
  }

  cancel(): void {
    this.ref.close()
  }
}
