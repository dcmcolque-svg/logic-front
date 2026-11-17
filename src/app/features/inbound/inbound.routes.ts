import { Routes } from '@angular/router'

export default [
  {
    path: 'receivings',
    data: { breadcrumb: 'Receivings' },
    loadComponent: () => import('./receivings/receivings.component').then(m => m.Receivings),
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
    data: { breadcrumb: 'Details' },
    loadComponent: () =>
      import('./receivings/components/details/details').then(m => m.default),
  },
  {
    path: 'processing/:id',
    data: { breadcrumb: 'Processing' },
    loadComponent: () =>
      import('./receivings/components/processing/processing').then(m => m.default),
  },
] as Routes
