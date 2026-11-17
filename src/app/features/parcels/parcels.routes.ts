import { Routes } from '@angular/router'

export default [
  {
    path: '',
    data: { breadcrumb: 'pages.all parcels' },
    loadComponent: () => import('./parcels.component'),
  },
  {
    path: 'upload-logs',
    data: {
      breadcrumb: 'import.upload_logs',
      module: 'parcels',
      moduleLabel: 'pages.all parcels',
    },
    loadComponent: () =>
      import('@/app/shared/components/upload-logs/upload-logs-page.component'),
  },
] as Routes
