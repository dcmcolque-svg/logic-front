import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { take } from 'rxjs/operators';

import { Report, ReportStructure, GenerateReportDTO, UpdateReportDTO } from '../reports.types';
import { ReportsService } from '../reports.service';

@Component({
  selector: 'app-custom-card-report',
  standalone: true,
  imports: [
    ButtonModule,
    ChipModule,
    ConfirmDialogModule,
    ToastModule,
    TooltipModule,
    TranslateModule,
  ],
  providers: [ConfirmationService, DialogService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './custom-card-report.html',
  styleUrl: './custom-card-report.scss',
})
export class CustomCardReport implements OnInit {
  // ── Inputs ─────────────────────────────────────────────────────────────────
  @Input({ required: true }) report!: Report;
  @Input({ required: true }) reportStructure!: ReportStructure;

  // ── Outputs ────────────────────────────────────────────────────────────────
  @Output() reportDeleted  = new EventEmitter<void>();
  @Output() reportEdited   = new EventEmitter<void>();
  @Output() reportGenerated = new EventEmitter<void>();

  // ── Services ───────────────────────────────────────────────────────────────
  private readonly reportsService      = inject(ReportsService);
  private readonly translate           = inject(TranslateService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService      = inject(MessageService);
  private readonly dialogService       = inject(DialogService);

  // ── State ──────────────────────────────────────────────────────────────────
  loading = signal(false);

  // ── Computed colors from report.color ─────────────────────────────────────
  colorIcon           = '';
  backgroundColorIcon = '';

  private dialogRef: DynamicDialogRef | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    if (this.report.color) {
      this.computeColors(this.report.color);
    }
  }

  // ── Color helpers ──────────────────────────────────────────────────────────
  private computeColors(hex: string): void {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return;
    this.colorIcon           = this.rgba(rgb, 0.8, 1);
    this.backgroundColorIcon = this.rgba(rgb, 1, 0.15);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m
      ? { r: Number.parseInt(m[1], 16), g: Number.parseInt(m[2], 16), b: Number.parseInt(m[3], 16) }
      : null;
  }

  private rgba({ r, g, b }: { r: number; g: number; b: number }, factor: number, alpha: number): string {
    return `rgba(${Math.min(255, r * factor)}, ${Math.min(255, g * factor)}, ${Math.min(255, b * factor)}, ${alpha})`;
  }

  get recipientsTooltip(): string {
    const r = this.report.schedule_config?.recipients;
    if (!r) return '';
    return r.join(', ');
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  openEditDialog(): void {
    // Lazy-load the dialog to avoid a circular dependency
    import('../report-dialog/report-dialog').then(({ ReportDialog }) => {
      const header = this.report.name || this.translate.instant('generatereport.create_report');

      const ref = this.dialogService.open(ReportDialog, {
        header,
        width: '45rem',
        data: {
          action: 'edit',
          title: this.report.report_type,
          reportData: this.report,
          reportStructure: this.reportStructure,
          file_type: this.reportStructure.file_type,
          report_frequency: this.reportStructure.report_frequency,
          fields: this.report.fields ?? [],
        },
      });
      if (!ref) return;
      this.dialogRef = ref;
      // take(1) auto-unsubscribes after the dialog closes once
      ref.onClose.pipe(take(1)).subscribe((result: unknown) => {
        if (result) this.reportEdited.emit();
      });
    });
  }

  confirmDelete(): void {
    this.confirmationService.confirm({
      header:                   this.translate.instant('messages.confirmation'),
      message:                  this.translate.instant('messages.confirmation_delete_msg2'),
      acceptLabel:              this.translate.instant('buttons.yes'),
      rejectLabel:              this.translate.instant('buttons.no'),
      acceptIcon:               'pi pi-check mr-2',
      rejectIcon:               'pi pi-times mr-2',
      rejectButtonStyleClass:   'p-button-sm',
      acceptButtonStyleClass:   'p-button-outlined p-button-sm',
      accept: () => this.deleteReport(),
    });
  }

  private deleteReport(): void {
    this.reportsService.deleteReport(this.report.id).subscribe({
      next: () => this.reportDeleted.emit(),
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: this.translate.instant('messages.error_generic'),
        });
      },
    });
  }

  updateIsActive(enabled: boolean): void {
    this.loading.set(true);
    const dto: UpdateReportDTO = {
      name:            this.report.name,
      description:     this.report.description,
      company_id:      this.report.company_id,
      is_active:       this.report.is_active,
      fields:          this.report.fields,
      schedule_config: { ...this.report.schedule_config, enabled },
    };

    this.reportsService.updateReport(this.report.id, dto).subscribe({
      next: () => {
        this.loading.set(false);
        this.reportEdited.emit();
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: this.translate.instant('messages.error_generic'),
        });
      },
    });
  }

  generateReport(): void {
    this.loading.set(true);
    const dto: GenerateReportDTO = {
      id:          this.report.id,
      company_id:  this.report.company_id,
      fields:      this.report.fields ?? [],
      file_type:   this.report.schedule_config.file_type ?? 'csv',
      type_report: this.report.report_type,
      initial_date:new Date().toISOString(),
      
    };

    this.reportsService.generateReport(dto).subscribe({
      next: (blob: Blob) => {
        const url      = globalThis.URL.createObjectURL(blob);
        const fileType = dto.file_type;
        const link     = Object.assign(document.createElement('a'), {
          href:     url,
          download: `${this.report.name ?? 'report'}.${fileType}`,
        });
        link.click();
        globalThis.URL.revokeObjectURL(url);
        this.loading.set(false);
        this.reportGenerated.emit();
      },
      error: (err: unknown) => {
        this.loading.set(false);
        // The generate endpoint uses responseType:'blob', so on error the body
        // also arrives as a Blob. We must read it manually to get the JSON message.
        const blobError =
          err instanceof HttpErrorResponse && err.error instanceof Blob
            ? err.error
            : null;

        if (blobError) {
          blobError.text().then(text => {
            try {
              const parsed  = JSON.parse(text);
              // Server may return a plain string ("No records found...")
              // or an object with a .message field
              const message = typeof parsed === 'string'
                ? parsed
                : (parsed?.message ?? this.translate.instant('reports.messages.error_generating_report'));
              this.messageService.add({ severity: 'error', summary: 'Error', detail: message });
            } catch {
              // Not valid JSON — show raw text if available, else generic message
              this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: text || this.translate.instant('reports.messages.error_generating_report'),
              });
            }
          });
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: this.translate.instant('reports.messages.error_generating_report'),
          });
        }
      },
    });
  }
}
