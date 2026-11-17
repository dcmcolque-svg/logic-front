import { Component, effect, inject } from '@angular/core'
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
import { TranslateLanService } from '../../../../../core/services/translate-lan.service'
import { CredentialsService } from '../../credentials.service'
import { FacilityKey, CreateApiKeyDto, UpdateApiKeyDto, OperatorKey } from '../../credentials.types'
import { FieldErrorComponent, isInvalidCtrl, handleFormError } from '../../../../../shared/components'

@Component({
  selector: 'app-operator-key-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    TranslateModule,
    FieldErrorComponent,
  ],
  providers: [],
  template: `
    <form [formGroup]="form" (submit)="save()" class="flex flex-col gap-4">
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
    </form>
  `,
})
export class OperatorKeyFormComponent {
  private readonly fb = inject(FormBuilder)
  private readonly ref = inject(DynamicDialogRef)
  private readonly config = inject(DynamicDialogConfig)
  private readonly svc = inject(CredentialsService)
  private readonly translate = inject(TranslateService)
  private readonly messageService = inject(MessageService)
  private readonly translateLan = inject(TranslateLanService)

  form: FormGroup
  loading = false
  obj: FacilityKey | null = null

  constructor() {
    this.obj = (this.config.data?.key as FacilityKey) ?? null

    this.form = this.fb.group({
      name: new FormControl(this.obj?.name ?? '', [Validators.required]),
    })

    effect(() => this.translate.use(this.translateLan.changeLanguage()))
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
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('common.error'),
            detail: this.translate.instant(err.code ?? err.error?.code),
          })
        },
        complete: () => { this.loading = false },
      })
    } else {
      const dto: CreateApiKeyDto = { name: formValue.name }
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
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('common.error'),
            detail: this.translate.instant('errors.' + (err.code ?? err.error?.code)),
          })
        },
        complete: () => { this.loading = false },
      })
    }
  }

  cancel(): void {
    this.ref.close()
  }
}
