import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  effect,
  inject,
  signal,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';

import { forkJoin } from 'rxjs';
import { TranslateLanService } from '../../../core/services/translate-lan.service';
import { ReportsService } from './reports.service';
import { CustomCardReport } from './custom-card-report/custom-card-report';
import { StandardCardReport } from './standard-card-report/standard-card-report';
import GeneratedReport from './generated-report/generated-report';
import {
  Report,
  ReportStructure,
  ReportViewMode,
  ReportMenuOption,
  BaseReportsResponse,
  CATEGORY_COLORS,
} from './reports.types';

// ── Category grouping ──────────────────────────────────────────────────────

interface CategoryGroup {
  key:       string;        // e.g. 'INBOUNDS'
  titleKey:  string;        // i18n key for the section heading
  subtitleKey: string;      // i18n key for the section subtitle
  color:     string;        // hex color passed to StandardCardReport
  reports:   Report[];
}

const CATEGORY_GROUPS: Omit<CategoryGroup, 'reports'>[] = [
  { key: 'INBOUNDS',  titleKey: 'pages.inbounds',  subtitleKey: 'reports.inbound_reports_subtitle',   color: CATEGORY_COLORS['INBOUNDS']  },
  { key: 'INVENTORY', titleKey: 'pages.inventory',  subtitleKey: 'reports.inventory_reports_subtitle', color: CATEGORY_COLORS['INVENTORY'] },
  { key: 'OUTBOUNDS', titleKey: 'pages.outbounds',  subtitleKey: 'reports.outbound_reports_subtitle',  color: CATEGORY_COLORS['OUTBOUNDS'] },
  { key: 'PARCELS',   titleKey: 'pages.parcels',    subtitleKey: 'reports.parcels_reports_subtitle',   color: CATEGORY_COLORS['PARCELS']   },
];

// ── Menu options ────────────────────────────────────────────────────────────

const MENU_OPTIONS: ReportMenuOption[] = [
  { label: 'standard_reports', value: 'STANDARD'   },
  { label: 'custom_reports',   value: 'CUSTOM'      },
  { label: 'generated_reports',value: 'GENERATED'   },
];

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    UpperCasePipe,
    ButtonModule,
    SelectModule,
    ToastModule,
    ProgressSpinnerModule,
    CustomCardReport,
    StandardCardReport,
    GeneratedReport,
  ],
  providers: [DialogService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export default class Reports implements OnInit {

  // ── Services ───────────────────────────────────────────────────────────────
  private readonly svc             = inject(ReportsService);
  private readonly translate       = inject(TranslateService);
  private readonly translateLanSvc = inject(TranslateLanService);
  private readonly messageService  = inject(MessageService);
  private readonly dialogService   = inject(DialogService);
  private readonly fb              = inject(FormBuilder);
  private readonly cdr             = inject(ChangeDetectorRef);

  // ── Form ───────────────────────────────────────────────────────────────────
  readonly menuOptions: ReportMenuOption[] = MENU_OPTIONS;
  form: FormGroup = this.fb.group({
    selectedMenu: [MENU_OPTIONS[0]],
  });

  // ── State ──────────────────────────────────────────────────────────────────
  loading       = signal(false);
  reports       = signal<Report[]>([]);
  reportStructure = signal<ReportStructure>({ file_type: [], report_frequency: [] });

  // ── Derived: category groups for STANDARD view ─────────────────────────────
  categoryGroups = signal<CategoryGroup[]>([]);

  // ── Computed: current view mode ────────────────────────────────────────────
  get viewMode(): ReportViewMode {
    return (this.form.get('selectedMenu')?.value as ReportMenuOption)?.value ?? 'STANDARD';
  }

  get selectedMenuLabel(): string {
    return (this.form.get('selectedMenu')?.value as ReportMenuOption)?.label ?? '';
  }

  private dialogRef: DynamicDialogRef | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  constructor() {
    effect(() => {
      this.translate.use(this.translateLanSvc.changeLanguage());
    });
  }

  ngOnInit(): void {
    this.loadForCurrentView();
  }

  // ── Menu selection ─────────────────────────────────────────────────────────
  onMenuChange(): void {
    this.loadForCurrentView();
    this.cdr.markForCheck();
  }

  private loadForCurrentView(): void {
    if (this.viewMode === 'STANDARD') {
      this.loadBaseReports();
    } else if (this.viewMode === 'CUSTOM') {
      this.loadCustomReports();
    }
    // GENERATED view is self-contained inside the GeneratedReport component
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  private loadBaseReports(): void {
    this.loading.set(true);
    this.svc.getBaseReports().subscribe({
      next: (resp: BaseReportsResponse) => {
        this.reports.set(resp.data ?? []);
        this.reportStructure.set({
          file_type:        resp.file_type ?? [],
          report_frequency: resp.report_frequency ?? [],
          facilities:       resp.facilities ?? [],
        });
        this.buildCategoryGroups(resp.data ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadCustomReports(): void {
    this.loading.set(true);

    // Always ensure reportStructure is populated (needed by the edit dialog).
    // Load base metadata + custom list in parallel.
    forkJoin({
      base:    this.svc.getBaseReports(),
      custom:  this.svc.getBaseReportTemplateList(),
    }).subscribe({
      next: ({ base, custom }) => {
        this.reportStructure.set({
          file_type:        base.file_type ?? [],
          report_frequency: base.report_frequency ?? [],
          facilities:       base.facilities ?? [],
        });
        this.reports.set(custom ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private buildCategoryGroups(allReports: Report[]): void {
    const groups: CategoryGroup[] = CATEGORY_GROUPS.map(g => ({
      ...g,
      reports: allReports
        .filter(r => r.category_report?.toUpperCase() === g.key)
        .map(r => ({ ...r, color: r.color || g.color })),
    }));
    this.categoryGroups.set(groups);
  }

  // ── Dialog: open create/edit for standard reports ──────────────────────────
  openCreateDialog(report: Report): void {
    const titleKey = `reports.report_names.${report.name}`;

    this.translate.get(titleKey).subscribe(header => {
      import('./report-dialog/report-dialog').then(({ ReportDialog }) => {
        const ref = this.dialogService.open(ReportDialog, {
          header,
          width: '45rem',
          data: {
            action: 'create',
            title: report.report_type,
            reportData: report,
            reportStructure: this.reportStructure(),
            file_type: this.reportStructure().file_type,
            report_frequency: this.reportStructure().report_frequency,
            fields: report.fields ?? [],
          },
        });
        if (!ref) return;
        this.dialogRef = ref;
        ref.onClose.subscribe((result: string | undefined) => {
          if (result) this.onReportCallback('STANDARD', result);
        });
      });
    });
  }

  // ── Callbacks from card components ─────────────────────────────────────────
  onReportCallback(type: string, action: string): void {
    this.messageService.add({
      severity: 'success',
      summary:  this.translate.instant('messages.success'),
      detail:   this.translate.instant(`reports.messages.${action}`),
    });
    if (type === 'STANDARD') this.loadBaseReports();
    if (type === 'CUSTOM')   this.loadCustomReports();
  }
}
