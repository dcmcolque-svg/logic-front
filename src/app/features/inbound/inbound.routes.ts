import { unsavedChangesGuard } from '@/app/core/guards/unsaved-changes.guard'
import { Routes } from '@angular/router'

export default [
  {
    path: 'receivings',
    data: { breadcrumb: 'pages.receivings' },
    loadComponent: () => import('./receivings/receivings.component').then(m => m.Receivings),
  },
  {
    path: 'suppliers',
    data: { breadcrumb: 'pages.suppliers' },
    loadComponent: () => import('./suppliers/suppliers.component'),
  },
  {
    path: 'receivings/upload-logs',
    data: {
      breadcrumb: 'import.upload_logs',
      module: 'receivings',
      moduleLabel: 'pages.receivings',
    },
    loadComponent: () =>
      import('@/app/shared/components/upload-logs/upload-logs-page.component'),
  },
  {
    path: 'details/:id',
    data: { breadcrumb: 'pages.receivings_details' },
    loadComponent: () =>
      import('./receivings/components/details/details').then(m => m.default),
  },
  {
    path: 'processing/:id',
    data: { breadcrumb: 'pages.processing' },
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () =>
      import('./receivings/components/processing/processing').then(m => m.default),
  },
] as Routes
