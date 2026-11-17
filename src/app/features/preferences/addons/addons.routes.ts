import { Routes } from '@angular/router'

export default [
  {
    path: '',
    data: { breadcrumb: 'Addons' },
    loadComponent: () =>
      import('./addons.component').then((m) => m.AddonsComponent),
  },
] as Routes
