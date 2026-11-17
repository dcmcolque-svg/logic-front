import { Routes } from '@angular/router'

export default [
  {
    path: '',
    data: { breadcrumb: 'pages.all_orders' },
    loadComponent: () => import('./allorders.component'),
  },
] as Routes
