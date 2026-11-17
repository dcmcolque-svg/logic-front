// === Shared Components Barrel Export ===
// Import from '@/app/shared/components' instead of individual paths.

// DataTable
export { BaseDataTable } from './datatable/data-table/base-data-table.component'
export { BaseDataTableMobile } from './datatable/data-table-mobile/base-data-table-mobile.component'
export { BaseTableSkeleton } from './datatable/table-skeleton/base-table-skeleton.component'

// Form
export { BaseFormField } from './form/form-field/base-form-field.component'
export { BaseFormGroup } from './form/form-group/base-form-group.component'
export { FieldErrorComponent, setFieldError, isInvalidCtrl, handleFormError, resolveErrorMessage } from './form/field-error/field-error.component'

// Dialog
export { BaseDialog } from './dialog/dialog/base-dialog.component'
export { BaseConfirmDialog } from './dialog/confirm-dialog/base-confirm-dialog.component'

// Import / Export
export { BaseImportExportMenu } from './import-export-menu/base-import-export-menu.component'
export type { ExportPageFetcher } from './import-export-menu/base-import-export-menu.component'
export { BaseImportDialog } from './import-dialog/base-import-dialog.component'
export type { ImportFacilityOption } from './import-dialog/base-import-dialog.component'
export { BaseUploadLogs } from './upload-logs/base-upload-logs.component'

// Actions
export { BaseActionMenu } from './actions/action-menu/base-action-menu.component'
export { BaseIconButton } from './actions/icon-button/base-icon-button.component'

// Status
export { BaseStatusBadge } from './status/status-badge/base-status-badge.component'

// Loading
export { BasePageSkeleton } from './loading/page-skeleton/base-page-skeleton.component'
export { BaseLoadingOverlay } from './loading/loading-overlay/base-loading-overlay.component'

// Label Generator
export { LabelGeneratorDialog } from './label-generator/label-generator-dialog.component'
