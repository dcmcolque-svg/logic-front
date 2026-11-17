import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { TextareaModule } from 'primeng/textarea'
import { MessageService } from 'primeng/api'
import { ToastModule } from 'primeng/toast'
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog'
import { FieldErrorComponent, handleFormError, isInvalidCtrl } from '@/app/shared/components'
import { ProvidersService } from './providers.service'

@Component({
  selector: 'app-sendgrid-test-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, ButtonModule, InputTextModule, TextareaModule, ToastModule, FieldErrorComponent],
  providers: [MessageService],
  template: `
    <p-toast />
    <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
      <!-- To -->
      <div class="flex flex-col gap-1">
        <label class="field-label">
          {{ 'preferences.providers.test_email_placeholder' | translate }}
          <span class="text-red-500">*</span>
        </label>
        <input
          pInputText
          type="email"
          formControlName="email"
          placeholder="test@example.com"
          class="w-full"
          [ngClass]="{ 'ng-invalid ng-dirty': isInvalid('email') }"
        />
        <sh-field-error [ctrl]="form.get('email')"></sh-field-error>
      </div>

      <!-- Subject (hidden if template provided) -->
      @if (!template) {
        <div class="flex flex-col gap-1">
          <label class="field-label">{{ 'preferences.providers.test_subject_placeholder' | translate }}</label>
          <input
            pInputText
            type="text"
            formControlName="subject"
            [placeholder]="'preferences.providers.test_subject_placeholder' | translate"
            class="w-full"
            [ngClass]="{ 'ng-invalid ng-dirty': isInvalid('subject') }"
          />
          <sh-field-error [ctrl]="form.get('subject')"></sh-field-error>
        </div>

        <!-- Body -->
        <div class="flex flex-col gap-1">
          <label class="field-label">{{ 'preferences.providers.test_body_label' | translate }}
            <span class="text-red-500">*</span>
          </label>
          <textarea
            pTextarea
            formControlName="body"
            [placeholder]="'preferences.providers.test_body_placeholder' | translate"
            rows="5"
            style="width:100%;font-family:monospace;font-size:0.8rem;resize:vertical;"
            [ngClass]="{ 'ng-invalid ng-dirty': isInvalid('body') }"
          ></textarea>
          <sh-field-error [ctrl]="form.get('body')"></sh-field-error>
        </div>
      }

      <!-- Actions -->
      <div class="flex justify-end gap-2 pt-2">
        <p-button
          [label]="'buttons.cancel' | translate"
          severity="secondary"
          [outlined]="true"
          [text]="true"
          (click)="cancel()"
        />
        <p-button
          icon="pi pi-send"
          [label]="'preferences.providers.test_send' | translate"
          [loading]="sending()"
          [disabled]="form.invalid || (!template && !form.value.body) || sending()"
          (click)="send()"
        />
      </div>
    </form>
  `,
})
export class SendgridTestFormComponent {
  private readonly svc = inject(ProvidersService)
  private readonly ref = inject(DynamicDialogRef)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)
  private readonly fb = inject(FormBuilder)

  private readonly config = inject(DynamicDialogConfig)

  sending = signal(false)
  template: any = null

  constructor() {
    this.template = this.config.data?.template
  }

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    subject: [''],
    body: [''],
  })

  isInvalid(field: string): boolean {
    return isInvalidCtrl(this.form.get(field))
  }

  send(): void {
    if (this.form.invalid) return
    this.sending.set(true)
    const cfg = this.config.data?.sendGridConfig
    const val = this.form.getRawValue()
    this.svc.testEmail(
      val.email ?? '',
      val.subject || undefined,
      this.template ? undefined : (val.body ?? undefined),
      this.template,
      cfg?.api_key,
      cfg?.from_email,
      cfg?.from_name
    ).subscribe({
      next: () => {
        this.sending.set(false)
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('preferences.providers.test_email_success'),
          detail: this.translate.instant('preferences.providers.test_email_success_detail', { email: this.form.value.email }),
        })
        setTimeout(() => this.ref.close(true), 1500)
      },
      error: (err) => {
        this.sending.set(false)
        handleFormError(err, this.form, this.translate)
      },
    })
  }

  cancel(): void {
    this.ref.close(false)
  }
}
