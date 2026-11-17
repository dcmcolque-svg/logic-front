import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, effect, inject } from '@angular/core'
import {
  AbstractControl,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { CheckboxModule } from 'primeng/checkbox'
import { ChipModule } from 'primeng/chip'
import { InputTextModule } from 'primeng/inputtext'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { MessageModule } from 'primeng/message'
import { MessageService } from 'primeng/api'
import { MultiSelectModule } from 'primeng/multiselect'
import { ProgressBarModule } from 'primeng/progressbar'
import { SelectModule } from 'primeng/select'
import { ToastModule } from 'primeng/toast'
import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { UserAccountService } from './user-account.service'
import { AuthUser, AuthUserUpdateInput, CreateWithInviteCodeRequest, Facility, InviteUsersDto, Role } from './user-account.types'
import { FieldErrorComponent, handleFormError } from '../../../shared/components'

// ── Email validator ────────────────────────────────────────────────────────────

function validateEmails(control: AbstractControl): ValidationErrors | null {
  const emails = control.value as string[]
  if (!emails || emails.length === 0) return { required: true }
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  const invalid = emails.filter((e) => !re.test(e))
  return invalid.length > 0 ? { invalidEmails: { emails: invalid } } : null
}

interface EmailWithRole {
  email: string
  role_id?: number
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-user-account-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    SelectModule,
    MultiSelectModule,
    ChipModule,
    InputTextModule,
    CheckboxModule,
    ProgressBarModule,
    ToastModule,
    MessageModule,
    FieldErrorComponent,
  ],
  providers: [MessageService],
  template: `
    <form [formGroup]="userForm">

      @if (!user) {

        <!-- ── Emails ── -->
        <div class="flex flex-col field mb-4">
          <label class="font-semibold text-sm">
            {{ 'preferences.user_account.emails' | translate }}
            <span class="text-red-500 ml-1">*</span>
          </label>
          <small class="text-surface-400 mb-2">
            {{ 'labels.press_enter_to_add_email' | translate }}
          </small>
          <!-- ── Chip container: acts as the input field ── -->
          <div
            class="p-component border-round border-1 surface-border px-2 py-1 flex flex-wrap gap-1 align-items-center cursor-text overflow-hidden"
            style="min-height: 2.75rem"
            (click)="emailInput.focus()"
          >
            @for (email of emailsValue; track email) {
              <p-chip
                [label]="email"
                [removable]="true"
                (onRemove)="removeEmail(email)"
                styleClass="max-w-full"
                [style]="{ 'max-width': '100%' }"
              />
            }
            <input
              #emailInput
              type="email"
              class="border-none outline-none bg-transparent flex-1 text-color text-sm py-1"
              style="min-width: 10rem"
              [placeholder]="emailsValue.length === 0 ? 'email@example.com' : ''"
              (keydown.enter)="$event.preventDefault(); addEmailFromInput(emailInput)"
              (keydown.tab)="addEmailFromInput(emailInput)"
            />
          </div>
          <sh-field-error [ctrl]="userForm.get('emails')" />
        </div>

        <!-- ── Advanced mode ── -->
        <!-- <div class="field mb-4 flex align-items-center gap-3">
          <p-checkbox [binary]="true" formControlName="isAdvancedMode" inputId="advancedMode" />
          <label class="font-semibold text-sm cursor-pointer" for="advancedMode">
            {{ 'preferences.user_account.advanced_mode' | translate }}
            @if ((userForm.get('emails')?.value?.length ?? 0) < 2) {
              <span class="text-surface-400 font-normal ml-1 text-xs">
                ({{ 'labels.advanced_mode_min_emails' | translate }})
              </span>
            }
          </label>
        </div> -->

      } @else {

        <!-- ── Edit mode: user identity card ── -->
        Email:
        <div class="field mb-4 surface-100 border-round flex flex-column gap-1">
          <span class="font-semibold text-sm">{{ user.email }}</span>
        </div>

      }



      <!-- ── Advanced mode: role per email ── -->
      @if (userForm.get('isAdvancedMode')?.value && emailsWithRoles.length > 0) {
        <div class="field mb-4">
          <span class="font-semibold text-sm">
            {{ 'preferences.user_account.assign_roles' | translate }}
          </span>
          @for (item of emailsWithRoles; track item.email) {
            <div class="flex flex-column gap-1">
              <label class="text-sm text-surface-500">{{ item.email }}</label>
              <p-select
                [options]="roles"
                [(ngModel)]="item.role_id"
                [ngModelOptions]="{ standalone: true }"
                (onChange)="onRoleChange(item.email, $event.value)"
                optionLabel="display_name"
                optionValue="id"
                [showClear]="true"
                styleClass="w-full"
                appendTo="body"
                [placeholder]="'preferences.user_account.selected_rol' | translate"
              />
              @if (!item.role_id) {
                <small class="text-red-500">{{ 'labels.role_required' | translate }}</small>
              }
            </div>
          }
        </div>

      } @else {

        <!-- ── Role ── -->
        <div class="field mb-4">
          <label class="font-semibold text-sm">
            {{ 'preferences.user_account.user_type' | translate }}
            <span class="text-red-500 ml-1">*</span>
          </label>
          <p-select
            [options]="roles"
            formControlName="role"
            optionLabel="display_name"
            [showClear]="true"
            styleClass="w-full"
            appendTo="body"
            [placeholder]="'preferences.user_account.option' | translate"
          />
          @if (
            userForm.controls['role'].invalid &&
            (userForm.controls['role'].touched || userForm.controls['role'].dirty) &&
            !userForm.get('isAdvancedMode')?.value
          ) {
            <small class="text-red-500">{{ 'forms_validation.required' | translate }}</small>
          }
        </div>

      }

      <!-- ── Facility Names ── -->
      @if (facilities.length > 0) {
        <div class="field mb-4">
          <label class="font-semibold text-sm">
            {{ 'preferences.user_account.facility_names' | translate }}
            <span class="text-red-500 ml-1">*</span>
          </label>
          <p-multiSelect
            formControlName="facility_ids"
            [options]="facilities"
            optionLabel="name"
            optionValue="id"
            styleClass="w-full"
            appendTo="body"
            [placeholder]="'preferences.user_account.option' | translate"
            [showClear]="true"
          />
          @if (
            userForm.controls['facility_ids'].invalid &&
            (userForm.controls['facility_ids'].touched || userForm.controls['facility_ids'].dirty)
          ) {
            <small class="text-red-500">{{ 'forms_validation.required' | translate }}</small>
          }
        </div>
      }

    </form>

    @if (isLoading) {
      <p-progressBar mode="indeterminate" [style]="{ height: '3px' }" styleClass="mt-3" />
    }

    <!-- ── Footer ── -->
    <div class="flex justify-end gap-2 mt-5">
      <p-button
        [label]="'buttons.cancel' | translate"
        severity="secondary"
        [text]="true"
        (click)="closeDialog()"
      />
      @if (!user) {
        <!-- EDGE-1357: Generate Access Code — same form, no SendGrid -->
        <p-button
          icon="pi pi-key"
          [label]="'users.generateCode' | translate"
          [outlined]="true"
          severity="secondary"
          [disabled]="!canSave() || isLoading"
          [loading]="isGeneratingCode"
          (click)="generateCode()"
        />
      }
      <p-button
        [label]="(user ? 'buttons.save' : 'preferences.user_account.invite_btn') | translate"
        [disabled]="!canSave() || isLoading"
        (click)="saveUser()"
      />
    </div>

    <p-toast />
  `,
  styles: [`
    :host ::ng-deep .p-chip {
      max-width: 100%;
    }
    :host ::ng-deep .p-chip-label {
      word-break: break-all;
      white-space: normal;
    }
  `],
})
export class UserAccountFormComponent {
  private readonly translate = inject(TranslateService)
  private readonly translateLanService = inject(TranslateLanService)
  private readonly ref = inject(DynamicDialogRef)
  private readonly config = inject(DynamicDialogConfig)
  private readonly svc = inject(UserAccountService)
  private readonly messageService = inject(MessageService)
  private readonly cdr = inject(ChangeDetectorRef)

  user: AuthUser | undefined
  roles: Role[] = []
  facilities: Facility[] = []
  emailsWithRoles: EmailWithRole[] = []
  isLoading = false
  private readonly _usernameTouched = false
  isGeneratingCode = false  // EDGE-1357


  get emailsValue(): string[] {
    return this.userForm?.get('emails')?.value ?? []
  }

  userForm!: FormGroup

  constructor() {
    effect(() => this.translate.use(this.translateLanService.changeLanguage()))
    this.user = this.config.data?.user
    this.roles = this.config.data?.roles ?? []
    this.facilities = this.config.data?.facilities ?? []
    this.initForm()
  }

  private initForm(): void {
    this.userForm = new FormGroup({
      emails: new FormControl(
        this.user?.email ? [this.user.email] : [],
        [Validators.required, validateEmails],
      ),
      role: new FormControl(
        this.roles.find((r) => r.id === this.user?.role_id) ?? null,
        [Validators.required],
      ),
      facility_ids: new FormControl(
        this.user?.facility_ids?.length ? this.user.facility_ids : [],
        this.facilities.length > 0 ? [Validators.required] : [],
      ),
      isAdvancedMode: new FormControl({ value: false, disabled: true }),
    })

    this.userForm.get('emails')?.valueChanges.subscribe((emails: string[]) => {
      if (emails.length >= 2) {
        this.userForm.get('isAdvancedMode')?.enable()
      } else {
        this.userForm.get('isAdvancedMode')?.setValue(false)
        this.userForm.get('isAdvancedMode')?.disable()
      }
      if (this.userForm.get('isAdvancedMode')?.value) {
        this.updateEmailsWithRoles(emails)
      }
    })

    this.userForm.get('isAdvancedMode')?.valueChanges.subscribe((advanced) => {
      const emails: string[] = this.userForm.get('emails')?.value ?? []
      if (advanced) {
        this.userForm.get('role')?.clearValidators()
        this.updateEmailsWithRoles(emails)
      } else {
        this.userForm.get('role')?.setValidators([Validators.required])
        this.emailsWithRoles = this.emailsWithRoles.map((i) => ({ ...i, role_id: undefined }))
      }
      this.userForm.get('role')?.updateValueAndValidity()
    })
  }

  canSave(): boolean {
    if (!this.userForm.valid) return false
    if (this.userForm.get('isAdvancedMode')?.value) {
      return this.emailsWithRoles.every((i) => i.role_id !== undefined)
    }
    return true
  }

  private readonly EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

  /** Called when user presses Enter or Tab in the chip input */
  addEmailFromInput(input: HTMLInputElement): void {
    const value = input.value.trim()
    if (!value) return
    input.value = ''
    this.addEmail(value)
  }

  /** Called when a chip's × is clicked */
  removeEmail(email: string): void {
    const current: string[] = this.userForm.get('emails')?.value ?? []
    this.userForm.get('emails')?.setValue(current.filter((e) => e !== email))
    this.clearEmailError()
  }

  private addEmail(value: string): void {
    this.clearEmailError()
    const current: string[] = this.userForm.get('emails')?.value ?? []

    // 1. Validate format
    if (!this.EMAIL_RE.test(value)) {
      this.setEmailError(`"${value}" — ${this.translate.instant('forms_validation.valid_email')}`)
      return
    }

    // 2. Check duplicate
    if (current.includes(value)) {
      this.setEmailError(this.translate.instant('preferences.user_account.duplicate_email'))
      return
    }

    // 3. Add
    this.userForm.get('emails')?.setValue([...current, value])
  }

  private setEmailError(msg: string): void {
    const ctrl = this.userForm.get('emails')
    ctrl?.setErrors({ ...ctrl.errors, serverError: msg })
  }

  private clearEmailError(): void {
    const ctrl = this.userForm.get('emails')
    if (!ctrl?.errors) return
    const { serverError: _, ...rest } = ctrl.errors
    ctrl.setErrors(Object.keys(rest).length ? rest : null)
  }


  updateEmailsWithRoles(emails: string[]): void {
    const existing = new Map(this.emailsWithRoles.map((i) => [i.email, i.role_id]))
    this.emailsWithRoles = emails.map((email) => ({ email, role_id: existing.get(email) }))
  }

  onRoleChange(email: string, roleId: number): void {
    const item = this.emailsWithRoles.find((e) => e.email === email)
    if (item) item.role_id = roleId || undefined
  }

  saveUser(): void {
    const role: Role = this.userForm.get('role')?.value
    const isAdvanced = this.userForm.get('isAdvancedMode')?.value
    const facilityIds: string[] = this.userForm.get('facility_ids')?.value ?? []

    if (this.user?.id) {
      // ── Edit: PUT /v2/authuser/:id ─────────────────────────────────────────
      const dto: AuthUserUpdateInput = {
        role_id: role?.id ?? this.user.role_id,
        facility_ids: facilityIds.length > 0 ? facilityIds : undefined,
      }
      this.isLoading = true
      this.svc.putUpdateUser(this.user.id, dto).subscribe({
        next: (updated) => { this.isLoading = false; this.ref.close(updated) },
        error: (e) => {
          this.isLoading = false
          handleFormError(e, this.userForm, this.translate)
        },
      })
    } else {
      // ── Invite: POST keyauth/users/invite (SendGrid) ───────────────────────
      const emails: string[] = this.userForm.get('emails')?.value ?? []
      const dto: InviteUsersDto = {
        facility_ids: facilityIds,
        emails: isAdvanced
          ? this.emailsWithRoles.map((i) => ({ email: i.email, username: i.email, role_id: i.role_id ?? role?.id }))
          : emails.map((email) => ({ email, username: email, role_id: role?.id })),
      }
      this.isLoading = true
      this.svc.sendInviteOnRegistration(dto).subscribe({
        next: () => { this.isLoading = false; this.ref.close(dto) },
        error: (e) => {
          this.isLoading = false
          handleFormError(e, this.userForm, this.translate)
        },
      })
    }
  }

  // EDGE-1357: Create invited users + generate access codes in a single call (no SendGrid)
  generateCode(): void {
    const role: Role = this.userForm.get('role')?.value
    const isAdvanced = this.userForm.get('isAdvancedMode')?.value
    const facilityIds: string[] = this.userForm.get('facility_ids')?.value ?? []
    const emails: string[] = this.userForm.get('emails')?.value ?? []
    if (!emails.length || !role?.id) return

    // Same DTO shape as saveUser() / sendInviteOnRegistration
    const dto: CreateWithInviteCodeRequest = {
      facility_ids: facilityIds,
      emails: isAdvanced
        ? this.emailsWithRoles.map((i) => ({ email: i.email, role_id: i.role_id ?? role?.id }))
        : emails.map((email) => ({ email, role_id: role?.id })),
    }

    this.isGeneratingCode = true
    this.cdr.markForCheck()

    this.svc.createWithInviteCode(dto).subscribe({
      next: () => {
        this.isGeneratingCode = false
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('labels.success'),
          detail: this.translate.instant('preferences.user_account.users_created'),
        })
        setTimeout(() => this.ref.close(true), 1500)
      },
      error: (e) => {
        this.isGeneratingCode = false
        this.cdr.markForCheck()
        handleFormError(e, this.userForm, this.translate)
      },
    })
  }


  closeDialog(): void {
    this.ref.close()
  }
}
