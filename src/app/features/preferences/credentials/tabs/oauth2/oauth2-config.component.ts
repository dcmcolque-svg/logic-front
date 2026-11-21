import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core'
import { CommonModule, UpperCasePipe } from '@angular/common'
import { DisplayDatePipe } from '@/app/shared/pipes/display-date.pipe'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { TableModule } from 'primeng/table'
import { ToastModule } from 'primeng/toast'
import { TooltipModule } from 'primeng/tooltip'
import { TagModule } from 'primeng/tag'
import { SkeletonModule } from 'primeng/skeleton'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog'
import { ConfirmationService, MessageService, MenuItem } from 'primeng/api'
import { MenuModule, Menu } from 'primeng/menu'

import { TranslateLanService } from '../../../../../core/services/translate-lan.service'
import { CredentialsService } from '../../credentials.service'
import { OAuth2CredentialResponse } from '../../credentials.types'
import { OAuth2FormComponent } from './oauth2-form.component'
import { translateOAuth2TestError, translateOAuth2TestSuccess } from './oauth2-test-error.util'

@Component({
  selector: 'app-oauth2-list',
  standalone: true,
  imports: [
    CommonModule,
    DisplayDatePipe,
    FormsModule,
    TranslateModule,
    ButtonModule,
    TableModule,
    ToastModule,
    TooltipModule,
    TagModule,
    SkeletonModule,
    ConfirmDialogModule,
    MenuModule,
    UpperCasePipe,
  ],
  providers: [DialogService, ConfirmationService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmDialog
      acceptButtonStyleClass="p-button-text"
      rejectButtonStyleClass="p-button-text"
    ></p-confirmDialog>
    <p-menu #menu [model]="menuItems" [popup]="true"></p-menu>

    <div class="card shadow-none">
      <div class="flex justify-between mb-4">
        <h5 class="text-2xl pb-2 font-semibold">
          {{ 'credential_types.oauth2.description' | translate }}
        </h5>
        <div class="flex gap-2">
          <p-button
            icon="pi pi-plus"
            [label]="'buttons.add' | translate"
            (click)="openAddDialog()"
          ></p-button>
          <p-button
            icon="pi pi-refresh"
            [label]="'buttons.refresh' | translate"
            severity="secondary"
            [outlined]="true"
            [loading]="loading()"
            (click)="loadList()"
          ></p-button>
        </div>
      </div>

      <p-table
        [value]="items()"
        [loading]="loading()"
        styleClass="p-datatable-sm"
        [scrollable]="true"
        scrollHeight="60vh"
        [rowHover]="true"
      >
        <ng-template pTemplate="header">
          <tr>
            <th style="width: 3rem"></th>
            <th>{{ 'labels.provider' | translate }}</th>
            <th>{{ 'labels.client_id' | translate }}</th>
            <th>{{ 'labels.environment' | translate }}</th>
            <th>{{ 'labels.token_status' | translate }}</th>
            <th>{{ 'labels.updated_at' | translate }}</th>
            <th style="width: 8rem">{{ 'labels.actions' | translate }}</th>
          </tr>
        </ng-template>

        <ng-template pTemplate="body" let-item>
          <tr>
            <td>
              <button
                pButton
                class="p-button-text"
                type="button"
                icon="pi pi-ellipsis-v"
                (click)="toggleMenu($event, item)"
              ></button>
            </td>
            <td>
              <div class="flex items-center gap-2">
                <i class="pi pi-lock text-primary-400"></i>
                <span class="font-medium">{{ item.provider_name }}</span>
              </div>
            </td>
            <td>
              <span class="font-mono text-sm">{{ item.client_id }}</span>
            </td>
            <td>
              <p-tag
                [value]="item.env === 'production' ? 'Production' : 'QA'"
                [severity]="item.env === 'production' ? 'success' : 'warn'"
              ></p-tag>
            </td>
            <td>
              @if (item.token) {
                @if (isTokenValid(item.token.exp)) {
                  <p-tag
                    severity="success"
                    icon="pi pi-check-circle"
                    [pTooltip]="'Expires: ' + getExpDate(item.token.exp)"
                    value="Valid"
                  >
                  </p-tag>
                } @else {
                  <p-tag
                    severity="danger"
                    icon="pi pi-times-circle"
                    [pTooltip]="'Expired: ' + getExpDate(item.token.exp)"
                    value="Expired"
                  >
                  </p-tag>
                }
              } @else {
                <p-tag
                  severity="secondary"
                  icon="pi pi-minus-circle"
                  value="No token"
                ></p-tag>
              }
            </td>
            <td class="text-surface-400 text-sm">
              {{
                item.updated_at
                  ? (item.updated_at | displayDate: 'dateTime')
                  : '—'
              }}
            </td>
            <td>
              <div class="flex gap-1">
                <p-button
                  icon="pi pi-bolt"
                  [pTooltip]="'buttons.test_connection' | translate"
                  severity="secondary"
                  [text]="true"
                  [rounded]="true"
                  [loading]="testingProvider() === item.provider_name"
                  (click)="testConnection(item)"
                ></p-button>
              </div>
            </td>
          </tr>
        </ng-template>

        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="7">
              <div
                class="flex flex-col items-center gap-3 py-8 text-surface-400"
              >
                <i class="pi pi-lock text-4xl"></i>
                <span>{{ 'labels.no_oauth_providers' | translate }}</span>
                <p-button
                  icon="pi pi-plus"
                  [label]="'buttons.add_provider' | translate"
                  (click)="openAddDialog()"
                ></p-button>
              </div>
            </td>
          </tr>
        </ng-template>

        <ng-template pTemplate="loadingbody">
          @for (_ of skeletonRows; track $index) {
            <tr>
              @for (__ of skeletonCols; track $index) {
                <td><p-skeleton height="2rem"></p-skeleton></td>
              }
            </tr>
          }
        </ng-template>
      </p-table>
    </div>

    <p-toast></p-toast>
  `,
})
export class OAuth2ListComponent implements OnInit {
  @ViewChild('menu') menu!: Menu

  private readonly svc = inject(CredentialsService)
  private readonly translate = inject(TranslateService)
  private readonly translateLanService = inject(TranslateLanService)
  private readonly dialogService = inject(DialogService)
  private readonly confirmationService = inject(ConfirmationService)
  private readonly messageService = inject(MessageService)

  ref: DynamicDialogRef | null = null
  items = signal<OAuth2CredentialResponse[]>([])
  loading = signal(false)
  testingProvider = signal<string | null>(null)
  menuItems: MenuItem[] = []
  skeletonRows = new Array(3)
  skeletonCols = new Array(7)

  constructor() {
    effect(() => this.translate.use(this.translateLanService.changeLanguage()))
  }

  ngOnInit(): void {
    this.loadList()
  }

  loadList(): void {
    this.loading.set(true)
    this.svc.listOAuth2().subscribe({
      next: (data) => {
        this.items.set(data)
        this.loading.set(false)
      },
      error: () => {
        this.items.set([])
        this.loading.set(false)
      },
    })
  }

  openAddDialog(): void {
    this.ref = this.dialogService.open(OAuth2FormComponent, {
      header: this.translate.instant('credential_types.oauth2.title'),
      width: '520px',
      closeOnEscape: false,
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      data: { credential: null },
    })
    this.ref?.onClose.subscribe((result) => {
      if (result) this.loadList()
    })
  }

  openEditDialog(item: OAuth2CredentialResponse): void {
    this.ref = this.dialogService.open(OAuth2FormComponent, {
      header: this.translate.instant('credential_types.oauth2.title'),
      width: '520px',
      closeOnEscape: false,
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      data: { credential: item },
    })
    this.ref?.onClose.subscribe((result) => {
      if (result) this.loadList()
    })
  }

  deleteItem(item: OAuth2CredentialResponse): void {
    this.confirmationService.confirm({
      message: this.translate.instant('messages.confirmation_delete_msg'),
      header: this.translate.instant('messages.confirmation_delete'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.svc.deleteOAuth2(item.provider_name).subscribe({
          next: () => this.loadList(),
        })
      },
    })
  }

  testConnection(item: OAuth2CredentialResponse): void {
    this.testingProvider.set(item.provider_name)
    this.svc.testOAuth2Token(item.provider_name).subscribe({
      next: (res) => {
        this.testingProvider.set(null)
        this.messageService.add({
          severity: 'success',
          summary: `[${item.provider_name}] ${this.translate.instant('credential_types.oauth2.test_connection_ok')}`,
          detail: `${translateOAuth2TestSuccess(res.message, this.translate)} (${res.preview})`,
          life: 5000,
        })
        this.loadList()
      },
      error: (err: { message?: string }) => {
        this.testingProvider.set(null)
        this.messageService.add({
          severity: 'error',
          summary: `[${item.provider_name}] ${this.translate.instant('credential_types.oauth2.test_connection_failed')}`,
          detail: translateOAuth2TestError(err?.message ?? '', this.translate),
          life: 8000,
        })
      },
    })
  }

  toggleMenu(event: Event, item: OAuth2CredentialResponse): void {
    this.menuItems = [
      {
        label: this.translate.instant('buttons.edit'),
        icon: 'pi pi-pencil',
        command: () => this.openEditDialog(item),
      },
      {
        label: this.translate.instant('buttons.test_connection'),
        icon: 'pi pi-bolt',
        command: () => this.testConnection(item),
      },
      { separator: true },
      {
        label: this.translate.instant('buttons.delete'),
        icon: 'pi pi-trash',
        command: () => this.deleteItem(item),
      },
    ]
    this.menu.toggle(event)
  }

  isTokenValid(exp: number): boolean {
    return Date.now() < exp * 1000 - 5 * 60 * 1000
  }

  getExpDate(exp: number): string {
    return new Date(exp * 1000).toISOString().split('T')[0]
  }
}
