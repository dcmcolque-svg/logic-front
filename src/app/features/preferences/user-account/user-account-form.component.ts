import { CommonModule } from '@angular/common'
import { Component, effect, inject } from '@angular/core'
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { MessageModule } from 'primeng/message'
import { MessageService } from 'primeng/api'
import { MultiSelectModule } from 'primeng/multiselect'
import { PasswordModule } from 'primeng/password'
import { ProgressBarModule } from 'primeng/progressbar'
import { SelectModule } from 'primeng/select'
import { ToastModule } from 'primeng/toast'
import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { UserAccountService } from './user-account.service'
import { AuthUser, AuthUserCreateInput, AuthUserUpdateInput, Facility, Role } from './user-account.types'
import { FieldErrorComponent, handleFormError } from '../../../shared/components'

// FUTURE: invite-by-email / access-code flow (multi-email chips, advanced mode with a role per
// email, "Generate access code" button) was removed from this form on purpose. For now users are
// created directly with email + password. Previous implementation lives in git history
// (see CreateWithInviteCodeRequest / InviteUsersDto in user-account.types.ts and
// sendInviteOnRegistration / createWithInviteCode in user-account.service.ts, still available).

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
    InputTextModule,
    PasswordModule,
    ProgressBarModule,
    ToastModule,
    MessageModule,
    FieldErrorComponent,
  ],
  providers: [MessageService],
  template: `
    <form [formGroup]="userForm">

      @if (!user) {

        <!-- ── Email (login) ── -->
        <div class="flex flex-col field mb-4">
          <label class="font-semibold text-sm" for="userEmail">
            {{ 'preferences.user_account.login_email' | translate }}
            <span class="text-red-500 ml-1">*</span>
          </label>
          <input
            id="userEmail"
            pInputText
            type="email"
            class="w-full"
            formControlName="email"
            autocomplete="off"
            [placeholder]="'login.emailPlaceholder' | translate"
          />
          <sh-field-error [ctrl]="userForm.get('email')" />
        </div>

        <!-- ── Password ── -->
        <div class="flex flex-col field mb-4">
          <label class="font-semibold text-sm" for="userPassword">
            {{ 'preferences.user_account.password' | translate }}
            <span class="text-red-500 ml-1">*</span>
          </label>
          <p-password
            inputId="userPassword"
            formControlName="password"
            [feedback]="false"
            [toggleMask]="true"
            styleClass="w-full"
            inputStyleClass="w-full"
            autocomplete="new-password"
          />
          <small class="text-surface-400 mt-1">
            {{ 'preferences.user_account.password_hint' | translate: { min: MIN_PASSWORD_LENGTH } }}
          </small>
          <sh-field-error [ctrl]="userForm.get('password')" />
        </div>

        <!-- FUTURE: invite by email (multi-email chips) — removed for now, see note at top of file.
        <div class="flex flex-col field mb-4">
          <label class="font-semibold text-sm">{{ 'preferences.user_account.emails' | translate }}</label>
          <small class="text-surface-400 mb-2">{{ 'labels.press_enter_to_add_email' | translate }}</small>
          chips input: emailsValue / addEmailFromInput() / removeEmail()
        </div>
        FUTURE: advanced mode (one role per invited email) — emailsWithRoles / onRoleChange()
        -->

      } @else {

        <!-- ── Edit mode: user identity card ── -->
        Email:
        <div class="field mb-4 bg-surface-100 dark:bg-surface-800 rounded flex flex-col gap-1">
          <span class="font-semibold text-sm">{{ user.email }}</span>
        </div>

      }

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
          (userForm.controls['role'].touched || userForm.controls['role'].dirty)
        ) {
          <small class="text-red-500">{{ 'forms_validation.required' | translate }}</small>
        }
      </div>

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
      <!-- FUTURE: "Generate access code" button (EDGE-1357) — removed for now, see note at top of file. -->
      <p-button
        [label]="(user ? 'buttons.save' : 'preferences.user_account.create_btn') | translate"
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

  readonly MIN_PASSWORD_LENGTH = 8

  user: AuthUser | undefined
  roles: Role[] = []
  facilities: Facility[] = []
  isLoading = false

  userForm!: FormGroup

  constructor() {
    effect(() => this.translate.use(this.translateLanService.changeLanguage()))
    this.user = this.config.data?.user
    this.roles = this.config.data?.roles ?? []
    this.facilities = this.config.data?.facilities ?? []
    this.initForm()
  }

  private initForm(): void {
    const isCreate = !this.user
    this.userForm = new FormGroup({
      // Create-only fields (email = login, password)
      email: new FormControl('', isCreate ? [Validators.required, Validators.email] : []),
      password: new FormControl(
        '',
        isCreate ? [Validators.required, Validators.minLength(this.MIN_PASSWORD_LENGTH)] : [],
      ),
      role: new FormControl(
        this.roles.find((r) => r.id === this.user?.role_id) ?? null,
        [Validators.required],
      ),
      facility_ids: new FormControl(
        this.user?.facility_ids?.length ? this.user.facility_ids : [],
        this.facilities.length > 0 ? [Validators.required] : [],
      ),
    })
  }

  canSave(): boolean {
    return this.userForm.valid
  }

  saveUser(): void {
    if (!this.canSave()) return
    const role: Role = this.userForm.get('role')?.value
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
      return
    }

    // ── Create: POST /v2/authuser (email + password) ─────────────────────────
    const email = String(this.userForm.get('email')?.value ?? '').trim().toLowerCase()
    const dto: AuthUserCreateInput = {
      email,
      username: email,
      password: this.userForm.get('password')?.value,
      role_id: role.id,
      facility_ids: facilityIds,
      is_active: true,
      user_status: 'active',
    }
    this.isLoading = true
    this.svc.postCreateUser(dto).subscribe({
      next: (created) => { this.isLoading = false; this.ref.close(created) },
      error: (e) => {
        this.isLoading = false
        handleFormError(e, this.userForm, this.translate)
      },
    })
  }

  // FUTURE: invite by email (POST keyauth/users/invite) and "generate access code"
  // (POST /v2/authuser/create-with-invite-code) — removed from this form for now.
  // Service methods (sendInviteOnRegistration / createWithInviteCode) are kept.

  closeDialog(): void {
    this.ref.close()
  }
}
