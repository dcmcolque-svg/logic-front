import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { DatePickerModule } from 'primeng/datepicker';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { CdkDrag, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';

import { TranslateLanService } from '../../../../core/services/translate-lan.service';
import { ReportsService } from '../reports.service';
import { AuthService } from '@/app/core/services/auth.service';
import {
  FieldStructure,
  GenerateReportDTO,
  Report,
  ReportDialogData,
  UpdateReportDTO,
} from '../reports.types';

// ── Validators ──────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const dateRangeValidator: ValidatorFn = (ctrl: AbstractControl): ValidationErrors | null => {
  const from = ctrl.get('initial_date')?.value;
  const to   = ctrl.get('final_date')?.value;
  if (!from || !to) return null;
  return new Date(to) < new Date(from) ? { datesInvalid: true } : null;
};

export const atLeastOneSelectedValidator: ValidatorFn = (ctrl: AbstractControl): ValidationErrors | null => {
  const arr = ctrl as FormArray;
  if (!arr?.length) return { atLeastOneSelected: true };
  return arr.controls.some(c => c.get('selected')?.value === true)
    ? null
    : { atLeastOneSelected: true };
};

const atLeastOneOptionValidator: ValidatorFn = (ctrl: AbstractControl): ValidationErrors | null => {
  const arr: unknown[] = ctrl.value ?? [];
  return Array.isArray(arr) && arr.length > 0 ? null : { atLeastOneOption: true };
};

function validateEmails(ctrl: AbstractControl): ValidationErrors | null {
  const emails: string[] = ctrl.value ?? [];
  const invalid = emails.filter(e => !EMAIL_REGEX.test(e));
  return invalid.length ? { invalidEmails: { emails: invalid } } : null;
}

export const noExtraSpaces: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const v = control.value;
  if (!v) return null;
  const valStr = v.toString();

  const hasLeadingOrTrailing = valStr !== valStr.trim();
  const hasMultipleSpaces = /\s{2,}/.test(valStr);

  if (hasLeadingOrTrailing || hasMultipleSpaces) {
    return { extraSpaces: true };
  }
  return null;
};

// ── Component ───────────────────────────────────────────────────────────────

@Component({
  selector: 'app-report-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    AccordionModule,
    ButtonModule,
    CheckboxModule,
    AutoCompleteModule,
    DatePickerModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
    TextareaModule,
    ToastModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
  ],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './report-dialog.html',
  styleUrl: './report-dialog.scss',
})
export class ReportDialog implements OnInit {

  // ── Injected services ───────────────────────────────────────────────────────
  private readonly fb             = inject(FormBuilder);
  private readonly ref            = inject(DynamicDialogRef);
  private readonly config         = inject(DynamicDialogConfig<ReportDialogData>);
  private readonly translate      = inject(TranslateService);
  private readonly translateLanSvc = inject(TranslateLanService);
  private readonly messageService = inject(MessageService);
  private readonly reportsService = inject(ReportsService);
  private readonly authService    = inject(AuthService);
  readonly cdr                    = inject(ChangeDetectorRef);

  constructor() {
    effect(() => {
      this.translate.use(this.translateLanSvc.changeLanguage());
    });
  }

  // ── Dialog data (typed) ─────────────────────────────────────────────────────
  get data(): ReportDialogData {
    return this.config.data!;
  }

  // ── Derived option lists ────────────────────────────────────────────────────
  fileTypes: string[]                              = [];
  reportFrequencyOptions: { label: string; value: string }[] = [];
  accountOptions: { label: string; value: string }[]         = [];
  facilities: { id: string; code: string; name: string }[]   = [];

  // ── Form state ──────────────────────────────────────────────────────────────
  form!: FormGroup;
  loading = signal(false);
  editMode = signal(false);
  allFieldsSelected = signal(true);

  get fieldsArray(): FormArray {
    return this.form.get('report_fields') as FormArray;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  ngOnInit(): void {
    const d          = this.data;
    const reportData = d.reportData ?? ({} as Report);

    this.fileTypes    = d.file_type ?? [];
    this.facilities   = (d.reportStructure?.facilities ?? []) as { id: string; code: string; name: string }[];
    this.accountOptions = this.facilities.map(f => ({ label: f.name, value: f.id }));

    const rawFreqs: string[] = d.report_frequency ?? [];
    this.reportFrequencyOptions = rawFreqs.map(freq => ({
      value: freq,
      label: this.translate.instant(`reports.${freq}`),
    }));

    this.form = this.fb.group({
      id:                 [reportData.id ?? ''],
      icon:               [reportData.icon ?? ''],
      name:               [reportData.name ?? '', [Validators.required, noExtraSpaces]],
      description:        [reportData.description ?? '', [noExtraSpaces]],
      report_type:        [reportData.report_type ?? ''],
      category_report:    [reportData.category_report ?? ''],
      company_id:         [reportData.company_id ?? ''],
      is_active:          [reportData.is_active ?? false],
      initial_date:       ['', Validators.required],
      final_date:         [null],
      file_type:          [reportData.schedule_config?.file_type ?? '', Validators.required],
      accountID:          [null],

      schedule_config: this.fb.group({
        enabled:       [reportData.schedule_config?.enabled ?? false],
        frequency:     [reportData.schedule_config?.frequency ?? ''],
        time:          [this.isoToLocalTime(reportData.schedule_config?.time)],
        recipients:    [this.defaultRecipients(reportData.schedule_config?.recipients), validateEmails],
        email_subject: [reportData.schedule_config?.email_subject ?? ''],
        email_body:    [reportData.schedule_config?.email_body ?? ''],
        file_type:     [reportData.schedule_config?.file_type ?? ''],
      }),

      report_fields: this.fb.array(
        (d.fields ?? []).map(f => this.fieldGroup(f)),
        atLeastOneSelectedValidator,
      ),
    }, { validators: dateRangeValidator });

    // Sync allFieldsSelected indicator
    this.updateAllFieldsSelected();
    this.fieldsArray.valueChanges.subscribe(() => this.updateAllFieldsSelected());

    // ── Facility ID field sync ──────────────────────────────────────────────
    // When the user selects a facility from the dropdown, automatically write
    // its ID into the "Facility ID" field inside the report_fields array so
    // the backend receives it as a filter value.
    const facilityIdMatcher = (c: import('@angular/forms').AbstractControl) =>
      (c.get('label')?.value as string ?? '').toLowerCase() === 'facility id';

    // If the report type doesn't have a "Facility ID" field, inject one so
    // the selected facility can always be persisted with the template.
    if (!this.fieldsArray.controls.some(facilityIdMatcher)) {
      this.fieldsArray.push(this.fieldGroup({
        label: 'Facility ID',
        selected: false,
        type_field: 'NORMAL',
        filter_enabled: false,
        operator: 'equals',
        value: null,
        order: 0,
      } as any), { emitEvent: false });
    }

    this.form.get('accountID')!.valueChanges.subscribe((facilityId: string | null) => {
      const idx = this.fieldsArray.controls.findIndex(facilityIdMatcher);
      if (idx >= 0) {
        this.fieldsArray.at(idx).get('value')?.setValue(facilityId, { emitEvent: false });
      }
    });

    // Pre-populate the dropdown from an existing "Facility ID" value (edit mode)
    const existingFacilityField = this.fieldsArray.controls.find(facilityIdMatcher);
    const existingFacilityValue = existingFacilityField?.get('value')?.value;
    if (existingFacilityValue) {
      this.form.get('accountID')?.setValue(existingFacilityValue, { emitEvent: false });
    }
  }

  private toMultiSelectValue(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (value != null && value !== '') return [value];
    return [];
  }

  private fieldGroup(field: FieldStructure): FormGroup {
    // Options for multiSelect come from parameter.value (array of available choices)
    const paramValue = field.parameter?.value;
    const paramOptions: unknown[] = Array.isArray(paramValue) ? paramValue : [];
    const isMultiSelect = !!field.parameter && paramOptions.length > 0;

    // Selected value: normalize to array for multiSelect, keep as-is otherwise
    let selectedValue: unknown = field.value;
    if (isMultiSelect) {
      selectedValue = this.toMultiSelectValue(field.value);
    }

    return this.fb.group({
      label:          [field.label],
      selected:       [field.selected ?? false],
      operator:       [isMultiSelect ? 'in' : 'equals'],
      value:          [selectedValue, isMultiSelect && paramOptions.length > 1 ? atLeastOneOptionValidator : []],
      options:        [paramOptions],
      order:          [field.order],
      type_field:     [field.type_field],
      filter_enabled: [field.filter_enabled ?? false],
      parameter:      [field.parameter ?? null],
    });
  }

  private updateAllFieldsSelected(): void {
    const all = this.fieldsArray.controls.every(c => c.get('selected')?.value === true);
    this.allFieldsSelected.set(all);
  }

  // ── Field actions ───────────────────────────────────────────────────────────
  selectAllFields(): void {
    this.fieldsArray.controls.forEach(c =>
      c.get('selected')?.setValue(true, { emitEvent: false })
    );
    this.fieldsArray.markAsDirty();
    this.updateAllFieldsSelected();
  }

  unselectAllFields(): void {
    this.fieldsArray.controls.forEach(c =>
      c.get('selected')?.setValue(false, { emitEvent: false })
    );
    this.fieldsArray.markAsDirty();
    this.updateAllFieldsSelected();
  }

  toggleEditMode(): void {
    this.editMode.update(v => !v);
  }

  drop(event: import('@angular/cdk/drag-drop').CdkDragDrop<string[]>): void {
    // CDK only registers VISIBLE cdkDrag elements in its drop list, so
    // event.previousIndex / event.currentIndex are "visual" indices that skip
    // any item hidden by the @if (e.g. the "company" field).
    // We must map those visual indices back to the real FormArray positions.
    const visualToArrayIndex = (visualIdx: number): number => {
      let visible = 0;
      for (let i = 0; i < this.fieldsArray.controls.length; i++) {
        const label = (this.fieldsArray.controls[i].get('label')?.value ?? '').toLowerCase();
        if (label.includes('company')) continue; // hidden — not counted by CDK
        if (visible === visualIdx) return i;
        visible++;
      }
      return visualIdx; // fallback (should not happen)
    };

    const fromIdx = visualToArrayIndex(event.previousIndex);
    const toIdx   = visualToArrayIndex(event.currentIndex);

    const fields = [...this.fieldsArray.value];
    moveItemInArray(fields, fromIdx, toIdx);
    // Use emitEvent:false on clear/push to avoid N intermediate valueChanges emissions
    this.fieldsArray.clear({ emitEvent: false });
    fields.forEach(f => this.fieldsArray.push(this.fieldGroup(f), { emitEvent: false }));
    // Emit once after all fields are back in place
    this.fieldsArray.updateValueAndValidity();
    this.updateAllFieldsSelected();
  }


  // ── Recipients default ──────────────────────────────────────────────────────
  /** Seeds recipients with the user's own email when no recipients are saved yet. */
  private defaultRecipients(saved: string[] | undefined): string[] {
    if (saved && saved.length > 0) return saved
    const userEmail = this.authService.getUserEmail()
    return userEmail ? [userEmail] : []
  }

  // ── Email chip validation ───────────────────────────────────────────────────
  onEmailAdd(event: { originalEvent?: Event; value: string } | string): void {
    // p-autocomplete onAdd emits { originalEvent, value }; normalise both shapes
    const email = typeof event === 'string' ? event : event.value;
    const ctrl  = this.form.get('schedule_config.recipients')!;
    const emails: string[] = [...(ctrl.value ?? [])];

    if (!EMAIL_REGEX.test(email)) {
      ctrl.setValue(emails.filter(e => e !== email));
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('messages.error'),
        detail: this.translate.instant('reports.messages.invalid_email_format', { email }),
      });
      return;
    }

    const unique = [...new Set(emails)];
    if (unique.length < emails.length) {
      ctrl.setValue(unique);
      this.messageService.add({
        severity: 'warn',
        summary: this.translate.instant('messages.warning'),
        detail: this.translate.instant('reports.messages.duplicate_email'),
      });
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  clearAccountId(): void {
    const ctrl = this.form.get('accountID')!;
    ctrl.setValue(null);
    ctrl.markAsTouched();
  }

  markAsTouched(name: string): void {
    this.form.get(name)?.markAsTouched();
  }

  private isoToLocalTime(iso?: string | null): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return '';
    }
  }

  private prepareSubmitPayload(): Record<string, unknown> {
    const v = this.form.getRawValue();
    // Only send fields defined in the API contract.
    // accountID, initial_date, final_date, file_type (root) and report_fields
    // are internal-only and must NOT be sent to the backend.
    const { accountID, initial_date, final_date, file_type, report_fields, ...rest } = v;
    return { ...rest, fields: report_fields };
  }

  private prepareUpdatePayload(): UpdateReportDTO {
    const v = this.form.getRawValue();
    return {
      name:            v['name']          ?? '',
      description:     v['description']   ?? undefined,
      company_id:      v['company_id']    ?? undefined,
      is_active:       v['is_active']     ?? undefined,
      fields:          v['report_fields'] ?? [],
      schedule_config: v['schedule_config'],
    };
  }

  private prepareGeneratePayload(): GenerateReportDTO {
    const v = this.form.getRawValue();
    return {
      id:           v['id'],
      // accountID holds the selected facility id — use it as company_id for filtering
      company_id:   v['accountID'] ?? v['company_id'] ?? undefined,
      fields:       v['report_fields'] ?? [],
      file_type:    v['file_type'] ?? '',
      initial_date: v['initial_date'] ?? undefined,
      final_date:   v['final_date']   ?? undefined,
      type_report:  v['report_type']  ?? '',
    };
  }

  // ── Generate (download now) ─────────────────────────────────────────────────
  onGenerate(): void {
    this.form.markAllAsTouched();
    if (!this.form.get('initial_date')?.value || !this.form.get('file_type')?.value) return;

    this.loading.set(true);
    const payload  = this.prepareGeneratePayload();
    const fileType = payload.file_type;
    const name     = this.form.get('name')?.value ?? 'report';

    this.reportsService.generateReport(payload).subscribe({
      next: (blob: Blob) => {
        const url  = globalThis.URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), {
          href: url, download: `${name}.${fileType}`,
        });
        link.click();
        globalThis.URL.revokeObjectURL(url);
        this.loading.set(false);
        this.ref.close('report_generated');
      },
      error: (err: unknown) => {
        this.loading.set(false);
        void this.showGenerateError(err);
      },
    });
  }

  private async showGenerateError(err: unknown): Promise<void> {
    const rawMsg   = await this.extractGenerateErrorMessage(err);
    const errorMsg = this.localizeGenerateError(rawMsg);

    this.messageService.add({
      severity: 'error',
      summary: 'Error',
      detail: errorMsg,
    });
  }

  private async extractGenerateErrorMessage(err: any): Promise<string> {
    const fallback = this.translate.instant('reports.messages.error_generating_report');

    if (err?.error instanceof Blob) {
      try {
        const text = await err.error.text();
        return this.parseErrorBlobText(text) ?? fallback;
      } catch (e) {
        console.error('Failed to parse error blob:', e);
        return fallback;
      }
    }
    if (typeof err?.error === 'string') return err.error;
    if (err?.error?.message) return err.error.message;
    if (err?.message) return err.message;
    return fallback;
  }

  /** Extracts a message from an error blob's text, or null when none is found. */
  private parseErrorBlobText(text: string): string | null {
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not a valid JSON, keep as raw text
    }

    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      if ('message' in parsed) return String(parsed.message);
      if ('error' in parsed) return String(parsed.error);
      return null;
    }
    return text || null;
  }

  private localizeGenerateError(rawMsg: string): string {
    let errorMsg = rawMsg;
    // Clean wrapping quotes from the message (e.g. "No records found..." -> No records found...)
    if (errorMsg.startsWith('"') && errorMsg.endsWith('"')) {
      errorMsg = errorMsg.slice(1, -1);
    }

    // Try to translate if it's a known error code
    const errorKey   = `errors.${errorMsg}`;
    const translated = this.translate.instant(errorKey);
    if (translated !== errorKey) return translated;

    // Check if it matches "No records found for report X"
    const match = /No records found for report\s+(.+)/i.exec(errorMsg);
    if (!match) return errorMsg;

    const reportType           = match[1].trim().toLowerCase();
    const reportTypeKey        = `reports.types.${reportType}`;
    const translatedType       = this.translate.instant(reportTypeKey);
    const translatedReportType = translatedType === reportTypeKey
      ? (reportType.charAt(0).toUpperCase() + reportType.slice(1))
      : translatedType;

    return this.translate.instant('reports.messages.no_records_found_for_report', {
      report: translatedReportType
    });
  }

  // ── Save / Save-as-new ──────────────────────────────────────────────────────
  onSave(): void {
    if (this.form.get('name')?.invalid || this.form.get('description')?.invalid || this.form.get('report_fields')?.invalid) return;

    const v = this.form.getRawValue();
    if (!v.accountID || !v.name || !v.file_type) return;

    this.loading.set(true);

    // Localise schedule time — p-timepicker may return a Date or an "HH:mm" string
    const emailCfg = this.form.get('schedule_config')!;
    const timeRaw  = emailCfg.get('time')?.value;
    if (timeRaw) {
      let iso: string;
      if (timeRaw instanceof Date) {
        iso = timeRaw.toISOString();
      } else {
        // "HH:mm" string
        const timeStr = String(timeRaw);
        const d = new Date();
        d.setHours(+timeStr.substring(0, 2), +timeStr.substring(3, 5), 0, 0);
        iso = d.toISOString();
      }
      emailCfg.get('time')?.setValue(iso);
    }

    // Auto-set enabled flag
    const hasSchedule = emailCfg.get('time')?.value && emailCfg.get('frequency')?.value;
    emailCfg.get('enabled')?.setValue(!!hasSchedule);

    // Sync email file_type from main selector
    emailCfg.get('file_type')?.setValue(this.form.get('file_type')?.value);

    const isEdit = this.data.action === 'edit';
    const request$ = isEdit
      ? this.reportsService.updateReport(v['id'], this.prepareUpdatePayload())
      : this.reportsService.createReport(this.prepareSubmitPayload() as Partial<Report>);

    request$.subscribe({
      next: () => {
        this.loading.set(false);
        this.ref.close('report_saved');
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

  onCancel(): void {
    this.ref.close(false);
  }
}
