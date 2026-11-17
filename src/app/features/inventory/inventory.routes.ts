import { Routes } from '@angular/router'

export default [
  {
    path: 'catalog',
    data: { breadcrumb: 'Catalog' },
    loadComponent: () => import('./catalog/catalog.component'),
  },
  {
    path: 'catalog/upload-logs',
    data: {
      breadcrumb: 'import.upload_logs',
      module: 'catalog',
      moduleLabel: 'pages.catalog',
    },
    loadComponent: () =>
      import('@/app/shared/components/upload-logs/upload-logs-page.component'),
  },
  {
    path: 'tracecards',
    data: { breadcrumb: 'Tracecards' },
    loadComponent: () => import('./tracecards/warehouse.component'),
  },
  {
    path: 'tracecards/history/:kardexId',
    data: { breadcrumb: 'History' },
    loadComponent: () =>
      import('./tracecards/history/history.component'),
  },
] as Routes

