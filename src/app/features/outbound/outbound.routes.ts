import { Routes } from '@angular/router'

export default [
  {
    path: 'backorders',
    data: { breadcrumb: 'pages.backorders' },
    loadChildren: () => import('./backorders/backorders.routes'),
  },
  {
    path: 'processing',
    data: { breadcrumb: 'pages.processing' },
    loadChildren: () => import('./processing/processing.routes'),
  },
  {
    path: 'allorders',
    data: { breadcrumb: 'pages.all_orders' },
    loadChildren: () => import('./allorders/allorders.routes'),
  }
  // Future outbound routes (allorders, archived, etc.) go here
] as Routes
