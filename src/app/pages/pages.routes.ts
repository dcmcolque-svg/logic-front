import { Routes } from '@angular/router'
import { Empty } from './empty/empty'

export default [
  { path: 'empty', data: { breadcrumb: 'Empty' }, component: Empty },
  {
    path: 'demo',
    data: { breadcrumb: 'Demo' },
    loadChildren: () => import('./demo/demo.routes'),
  },
  { path: '**', redirectTo: '/notfound' },
] as Routes
