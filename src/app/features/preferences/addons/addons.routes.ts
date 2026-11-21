import { Routes } from '@angular/router'

export default [
  {
    path: '',
    data: { breadcrumb: 'pages.addons' },
    loadComponent: () =>
      import('./addons.component').then((m) => m.AddonsComponent),
  },
] as Routes
