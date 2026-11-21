import { Routes } from '@angular/router'

/** Sales module: point of sale, sales history and payment methods. */
export default [
  { path: '', pathMatch: 'full', redirectTo: 'pos' },
  {
    path: 'pos',
    data: { breadcrumb: 'pages.point of sale' },
    loadComponent: () => import('./pos/pos.component'),
  },
  {
    path: 'history',
    data: { breadcrumb: 'pages.sales history' },
    loadComponent: () => import('./history/sales-history.component'),
  },
  {
    path: 'customers',
    data: { breadcrumb: 'pages.customers' },
    loadComponent: () => import('./customers/customers.component'),
  },
  {
    path: 'payment-methods',
    data: { breadcrumb: 'pages.payment methods' },
    loadComponent: () => import('./payment-methods/payment-methods.component'),
  },
] as Routes
