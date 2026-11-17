import { Routes } from '@angular/router'

export default [
  {
    path: '',
    data: { breadcrumb: 'Demo' },
    loadComponent: () => import('./demo.component'),
  },
] as Routes
