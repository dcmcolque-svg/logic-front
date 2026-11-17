import { Routes } from '@angular/router'

export default [
  {
    path: '',
    data: { breadcrumb: 'pages.backorders' },
    loadComponent: () => import('./backorders.component'),
  },
] as Routes
