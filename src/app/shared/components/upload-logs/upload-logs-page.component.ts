import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { CommonModule, Location, UpperCasePipe } from '@angular/common'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { ToastModule } from 'primeng/toast'
import { MessageService } from 'primeng/api'
import { BaseUploadLogs } from './base-upload-logs.component'
import { BaseImportExportMenu } from '../import-export-menu/base-import-export-menu.component'
import { provideTableColumns } from '../../services/table-columns.bus'
import { ImportModule } from '../../types/import.types'

/**
 * UploadLogsPage — the Upload Logs screen for whichever module the route names.
 *
 * One page serves every module: the route supplies `data.module` (which
 * uploads to list) and `data.moduleLabel` (an i18n key for the subtitle), and
 * `?log=<id>` opens that upload straight away — which is how the import dialog
 * links to the log it just produced.
 *
 * ```ts
 * {
 *   path: 'upload-logs',
 *   data: { module: 'catalog', moduleLabel: 'pages.catalog' },
 *   loadComponent: () => import('.../upload-logs-page.component'),
 * }
 * ```
 */
@Component({
  selector: 'app-upload-logs-page',
  standalone: true,
  imports: [
    CommonModule,
    UpperCasePipe,
    TranslateModule,
    ButtonModule,
    ToastModule,
    BaseUploadLogs,
    BaseImportExportMenu,
  ],
  // El bus vive acá y no dentro de base-upload-logs: el menú es hermano de
  // ese componente, no hijo, así que un bus provisto adentro nunca le llega.
  providers: [MessageService, provideTableColumns()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-toast />

    <div class="grid grid-cols-12 gap-4">
      <div class="col-span-12">
        <div
          class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2"
        >
          <div class="flex items-center gap-3">
            <p-button icon="pi pi-arrow-left" [label]="'buttons.back' | translate" severity="secondary" [outlined]="true" size="small" (onClick)="goBack()" />
            <div>
              @if (moduleLabel) {
                <p class="text-surface-500 text-sm m-0">
                  {{ moduleLabel | translate }}
                </p>
              }
            </div>
          </div>

          <base-import-export-menu
            [filename]="'upload_logs_' + module"
            [columns]="logs.columns"
            [fetchPage]="logs.fetchExportPage"
            [sheetName]="'import.upload_logs' | translate"
          />
        </div>
      </div>

      <div class="col-span-12">
        <div class="card">
          <base-upload-logs #logs [module]="module" [initialLogId]="initialLogId" />
        </div>
      </div>
    </div>
  `,
})
export default class UploadLogsPageComponent {
  private readonly route = inject(ActivatedRoute)
  private readonly location = inject(Location)

  /** Which module's uploads this page lists. */
  readonly module = this.route.snapshot.data['module'] as ImportModule
  /** i18n key naming that module, shown under the title. */
  readonly moduleLabel = this.route.snapshot.data['moduleLabel'] as
    | string
    | undefined
  /** Log to open on arrival — set when coming from the import dialog. */
  readonly initialLogId = this.route.snapshot.queryParamMap.get('log')

  goBack(): void {
    this.location.back()
  }
}
