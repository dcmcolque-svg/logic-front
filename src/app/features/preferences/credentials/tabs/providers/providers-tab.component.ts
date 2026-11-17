import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { CardModule } from 'primeng/card'
import { TagModule } from 'primeng/tag'
import { TooltipModule } from 'primeng/tooltip'
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog'
import { ToastModule } from 'primeng/toast'
import { ConfirmationService, MessageService } from 'primeng/api'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { ProvidersService } from './providers.service'
import { SendGridFormComponent } from './sendgrid-form.component'
import { TwilioFormComponent } from './twilio-form.component'
import { XenvioFormComponent } from './xenvio-form.component'
import { SendgridTestFormComponent } from './sendgrid-test-form.component'
import { TwilioWhatsAppTestFormComponent } from './twilio-whatsapp-test-form.component'

export interface ProviderResponse {
  id: string
  operator_id: string
  provider_name: string
  config: Record<string, string>
  templates?: any[]
  is_active: boolean
  updated_at?: string
}

interface ProviderCard {
  name: string
  label: string
  description: string
  icon: string
  iconBg: string
  customIcon?: boolean
  data: ProviderResponse | null
  loading: boolean
}

@Component({
  selector: 'app-providers-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    CardModule,
    TagModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [DialogService, MessageService, ConfirmationService],
  template: `

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      @for (card of cards(); track card.name) {
        <div
          class="provider-card"
          [class.provider-card--active]="card.data?.is_active"
        >
          <!-- Card header -->
          <div class="provider-card__header">
            <div class="provider-card__icon" [style.background]="card.iconBg">
              @if (card.customIcon) {
                <span class="provider-card__letter">X</span>
              } @else {
                <i [class]="card.icon"></i>
              }
            </div>
            <div class="provider-card__info">
              <h4 class="provider-card__name">{{ card.label }}</h4>
              <p class="provider-card__desc">{{ card.description | translate }}</p>
            </div>
          </div>

          <!-- Status -->
          <div class="provider-card__status">
            @if (card.loading) {
              <span class="status-badge status-badge--loading">
                <i class="pi pi-spin pi-spinner"></i> {{ 'preferences.providers.status_loading' | translate }}
              </span>
            } @else if (card.data?.is_active) {
              <span class="status-badge status-badge--active">
                <i class="pi pi-check-circle"></i> {{ 'preferences.providers.status_configured' | translate }}
              </span>
              @if (card.data?.updated_at) {
                <span class="provider-card__date">
                  {{ 'preferences.providers.updated' | translate }} {{ card.data?.updated_at | date: 'mediumDate' }}
                </span>
              }
            } @else {
              <span class="status-badge status-badge--inactive">
                <i class="pi pi-circle"></i> {{ 'preferences.providers.status_not_configured' | translate }}
              </span>
            }
          </div>

          <!-- Actions -->
          <div class="provider-card__actions">
            <p-button
              [icon]="card.data?.is_active ? 'pi pi-pencil' : 'pi pi-plus'"
              [label]="card.data?.is_active ? ('buttons.edit' | translate) : ('buttons.configure' | translate)"
              size="small"
              (click)="openForm(card)"
            />
            @if (card.data?.is_active) {
              <p-button
                icon="pi pi-trash"
                [label]="'buttons.delete' | translate"
                severity="danger"
                [outlined]="true"
                [text]="true"
                size="small"
                (click)="deleteProvider(card)"
              />
            }
            @if (card.name === 'twilio_whatsapp' && card.data?.is_active) {
              <p-button
                icon="pi pi-whatsapp"
                [label]="'preferences.providers.test_whatsapp_label' | translate"
                severity="secondary"
                [outlined]="true"
                [text]="true"
                size="small"
                (click)="openTestWhatsApp(card.label)"
              />
            }
          </div>
        </div>
      }
    </div>

    <p-confirmDialog />
    <p-toast />
  `,
  styles: [`
    .provider-card {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      transition: box-shadow 0.2s, border-color 0.2s;
    }
    .provider-card:hover {
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    }
    .provider-card--active {
      border-color: var(--primary-color);
    }
    .provider-card__header {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
    }
    .provider-card__icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      color: #fff;
      flex-shrink: 0;
    }
    .provider-card__letter {
      color: #00D4C8;
      font-size: 1.4rem;
      font-weight: 800;
      font-family: 'Inter', sans-serif;
      letter-spacing: -1px;
      line-height: 1;
    }
    .provider-card__name {
      margin: 0 0 0.25rem;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-color);
    }
    .provider-card__desc {
      margin: 0;
      font-size: 0.78rem;
      color: var(--text-color-secondary);
      line-height: 1.4;
    }
    .provider-card__status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .provider-card__date {
      font-size: 0.72rem;
      color: var(--text-color-secondary);
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
    }
    .status-badge--active   { background: #dcfce7; color: #166534; }
    .status-badge--inactive { background: var(--surface-100); color: var(--text-color-secondary); }
    .status-badge--loading  { background: var(--surface-100); color: var(--text-color-secondary); }
    .provider-card__actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: auto;
    }
    .provider-card__test {
      border-top: 1px solid var(--surface-border);
      padding-top: 0.75rem;
      margin-top: 0.25rem;
    }
    .provider-card__test-label {
      margin: 0 0 0.5rem;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-color-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .provider-card__test-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .provider-card__test-input {
      flex: 1;
      font-size: 0.8rem;
      padding: 0.4rem 0.6rem;
      height: 2rem;
    }
  `],
})
export class ProvidersTabComponent implements OnInit {
  private readonly svc = inject(ProvidersService)
  private readonly dialogService = inject(DialogService)
  private readonly messageService = inject(MessageService)
  private readonly confirmationService = inject(ConfirmationService)
  private readonly translate = inject(TranslateService)

  ref: DynamicDialogRef | null = null

  globalLoading = signal(false)
  
  // Store the logo retrieved from the new ListHandle response
  logoUrl = signal<string>('')
  defaultTemplates = signal<any[]>([])

  cards = signal<ProviderCard[]>([
    {
      name: 'sendgrid',
      label: 'SendGrid',
      description: 'preferences.providers.sendgrid_desc',
      icon: 'pi pi-envelope',
      iconBg: '#1a82e2',
      data: null,
      loading: false,
    },
    {
      name: 'twilio_whatsapp',
      label: 'Twilio WhatsApp',
      description: 'preferences.providers.twilio_desc',
      icon: 'pi pi-comments',
      iconBg: '#25D366',
      data: null,
      loading: false,
    },
    {
      name: 'xenvio',
      label: 'Xenvio',
      description: 'preferences.providers.xenvio_desc',
      icon: 'pi pi-box',
      iconBg: '#0D1B3E',
      customIcon: true,
      data: null,
      loading: false,
    },
  ])

  ngOnInit(): void {
    this.loadAll()
  }

  loadAll(): void {
    this.globalLoading.set(true)
    this.svc.list().subscribe({
      next: (res) => {
        this.logoUrl.set(res.logo_url || '')
        this.defaultTemplates.set(res.default_templates || [])
        this.cards.update((cards) => this.mergeProviderData(cards, res.data))
        this.globalLoading.set(false)
      },
      error: () => {
        this.globalLoading.set(false)
      },
    })
  }

  /** Attaches each provider's saved configuration (if any) to its card. */
  private mergeProviderData(
    cards: ProviderCard[],
    data: ProviderResponse[] | undefined
  ): ProviderCard[] {
    return cards.map((c) => ({
      ...c,
      data: data?.find((p) => p.provider_name === c.name) ?? null,
      loading: false,
    }))
  }

  openForm(card: ProviderCard): void {
    if (card.name === 'sendgrid') {
      this.ref = this.dialogService.open(SendGridFormComponent, {
        header: 'Configure SendGrid',
        width: '90vw',
        style: { 'max-width': '650px' },
        contentStyle: { padding: '1.5rem', overflow: 'hidden' },
        baseZIndex: 10001,
        data: {
          existing: card.data,
          logoUrl: this.logoUrl(),
          defaultTemplates: this.defaultTemplates()
        },
      })
    } else if (card.name === 'xenvio') {
      this.ref = this.dialogService.open(XenvioFormComponent, {
        header: `${this.translate.instant(card.data?.is_active ? 'preferences.providers.dialog_edit' : 'preferences.providers.dialog_configure')} ${card.label}`,
        width: '520px',
        closable: true,
        contentStyle: { overflow: 'visible' },
        baseZIndex: 10000,
        data: { existing: card.data },
      })
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const component: any = TwilioFormComponent
      this.ref = this.dialogService.open(component, {
        header: `${this.translate.instant(card.data?.is_active ? 'preferences.providers.dialog_edit' : 'preferences.providers.dialog_configure')} ${card.label}`,
        width: '520px',
        closable: true,
        contentStyle: { overflow: 'visible' },
        baseZIndex: 10000,
        data: { existing: card.data },
      })
    }

    this.ref?.onClose.subscribe((saved: boolean) => {
      if (saved) {
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('preferences.providers.save_success'),
          detail: this.translate.instant('preferences.providers.save_success_detail', { label: card.label }),
        })
        this.loadAll()
      }
    })
  }

  deleteProvider(card: ProviderCard): void {
    this.confirmationService.confirm({
      message: this.translate.instant('preferences.providers.confirm_delete_msg', { label: card.label }),
      header: this.translate.instant('preferences.providers.confirm_delete'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.svc.delete(card.name).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: this.translate.instant('preferences.providers.delete_success'),
              detail: this.translate.instant('preferences.providers.delete_success_detail', { label: card.label }),
            })
            this.loadAll()
          },
          error: (err) => {
            this.messageService.add({
              severity: 'error',
              summary: this.translate.instant('messages.error'),
              detail: err?.error?.message ?? this.translate.instant('preferences.providers.delete_error'),
            })
          },
        })
      },
    })
  }

  openTestEmail(label: string): void {
    this.dialogService.open(SendgridTestFormComponent, {
      header: `${this.translate.instant('preferences.providers.test_email_label')} — ${label}`,
      width: '520px',
      closable: true,
      baseZIndex: 10000,
    })
  }

  openTestWhatsApp(label: string): void {
    this.dialogService.open(TwilioWhatsAppTestFormComponent, {
      header: `${this.translate.instant('preferences.providers.test_whatsapp_label')} — ${label}`,
      width: '480px',
      closable: true,
      baseZIndex: 10000,
    })
  }
}
