import { Routes } from '@angular/router'

export default [
  {
    path: '',
    data: { breadcrumb: 'pages.rotations' },
    loadComponent: () => import('./rotations.component'),
  },
] as Routes
