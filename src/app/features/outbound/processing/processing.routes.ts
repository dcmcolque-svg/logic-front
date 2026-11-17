import { Routes } from '@angular/router'

export default [
  {
    path: '',
    data: { breadcrumb: 'pages.processing' },
    loadComponent: () => import('./processing.component'),
  },
] as Routes
