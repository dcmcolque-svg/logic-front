import { Routes } from '@angular/router'

export default [
  {
    path: 'catalog',
    data: { breadcrumb: 'pages.catalog' },
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
    data: { breadcrumb: 'pages.tracecards' },
    loadComponent: () => import('./tracecards/warehouse.component'),
  },
  {
    // Inventory valued at cost — OWNER only (costing phase 5)
    path: 'valuation',
    data: { breadcrumb: 'pages.valuation' },
    loadComponent: () => import('./valuation/valuation.component'),
  },
  {
    path: 'tracecards/history/:kardexId',
    data: { breadcrumb: 'pages.history_kardex' },
    loadComponent: () =>
      import('./tracecards/history/history.component'),
  },
] as Routes

