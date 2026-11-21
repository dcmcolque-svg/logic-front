import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms'
import { DialogModule } from 'primeng/dialog'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { InputTextModule } from 'primeng/inputtext'
import { SelectModule } from 'primeng/select'
import { ToggleSwitchModule } from 'primeng/toggleswitch'
import { ButtonModule } from 'primeng/button'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageEdgeService } from '@/app/core/services/message.service'
import { AddonsService } from '../../services/addons.service'
import {
  AddonApplicationDto,
  AddonConfigDto,
} from '../../services/addons.types'
import { ConfirmationService } from 'primeng/api'
import { revealInvalid } from '@/app/shared/utils/form.util'

@Component({
  selector: 'app-addon-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    ToggleSwitchModule,
    ButtonModule,
    TranslateModule,
    ConfirmDialogModule,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './addon-form.component.html',
  styleUrl: './addon-form.component.scss',
})
export class AddonFormComponent implements OnInit {
  public readonly service = inject(AddonsService)
  private readonly messageService = inject(MessageEdgeService)
  private readonly confirmationService = inject(ConfirmationService)
  private readonly fb = inject(FormBuilder)
  private readonly translate = inject(TranslateService)

  visible = signal(false)
  saving = signal(false)
  isEdit = signal(false)

  application = signal<AddonApplicationDto | null>(null)
  private editId: string | null = null
  private currentCheckConnection = false

  form = this.fb.group({
    name: ['', Validators.required],
    company_id: ['', Validators.required],
    endpoint_url: ['', Validators.required],
    auth_token: ['', Validators.required],
    contact_email: ['', [Validators.required, Validators.email]],
    is_active: [false],
  })

  ngOnInit() {
    this.service.loadCompanies({
      filter: {},
      config: {
        page: 1,
        rows: 1000,
        sort_field: [{ field: 'name', order: 1 }],
      },
    })
  }

  open(application: AddonApplicationDto, config?: AddonConfigDto) {
    this.application.set(application)
    this.isEdit.set(!!config)
    this.editId = config?.id ?? null
    this.currentCheckConnection = config?.settings?.check_connection || false

    if (config) {
      this.form.patchValue({
        name: config.name,
        company_id: config.company_id,
        endpoint_url: config.endpoint_url,
        auth_token: config.auth_token,
        contact_email: config.contact_email,
        is_active: config.is_active,
      })
    } else {
      this.form.reset({ is_active: false })
    }

    this.visible.set(true)
  }

  save() {
    if (revealInvalid(this.form)) return

    this.saving.set(true)
    const formValues = this.form.getRawValue()

    const dto: AddonConfigDto = {
      id: this.editId || undefined,
      application_id: this.application()!.id,
      company_id: formValues.company_id as string,
      name: formValues.name as string,
      endpoint_url: formValues.endpoint_url as string,
      auth_token: formValues.auth_token as string,
      contact_email: formValues.contact_email as string,
      is_active: formValues.is_active as boolean,
      settings: {
        check_connection: this.currentCheckConnection,
      },
    }

    const request$ = this.isEdit()
      ? this.service.updateConfig(dto)
      : this.service.createConfig(dto)

    request$.subscribe({
      next: () => {
        this.messageService.showSuccess('Operation successful')
        this.saving.set(false)
        this.close()
        this.refreshList()
      },
      error: () => this.saving.set(false),
    })
  }

  deleteConfig() {
    if (!this.editId) return

    this.confirmationService.confirm({
      message: this.translate.instant('preferences.addons.confirm_delete'),
      header: this.translate.instant('preferences.addons.delete_message'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.saving.set(true)
        this.service.deleteConfig(this.editId!).subscribe({
          next: () => {
            this.messageService.showSuccess('Deleted successfully')
            this.saving.set(false)
            this.close()
            this.refreshList()
          },
          error: () => this.saving.set(false),
        })
      },
    })
  }

  close() {
    this.visible.set(false)
  }

  private refreshList() {
    // Reload configs
    this.service.loadConfigs({
      filter: {},
      config: {
        page: 1,
        rows: 1000,
        sort_field: [{ field: 'name', order: 1 }],
      },
    })
  }
}
