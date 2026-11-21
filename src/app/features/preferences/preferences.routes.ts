import { Routes } from '@angular/router'

export default [
  {
    path: 'useraccount',
    data: { breadcrumb: 'pages.user_account' },
    loadComponent: () => import('./user-account/user-account.component'),
  },
  {
    path: 'integrations',
    data: { breadcrumb: 'pages.integrations' },
    loadComponent: () => import('./credentials/credentials.component'),
  },
  {
    // Legacy redirect: /preferences/webhooks → /preferences/integrations
    // The Webhooks tab now lives inside Integrations.
    path: 'webhooks',
    redirectTo: 'integrations',
    pathMatch: 'full',
  },
  {
    path: 'locations',
    data: { breadcrumb: 'pages.locations' },
    loadComponent: () => import('./locations/locations.component'),
  },
  {
    path: 'rotations',
    loadChildren: () => import('./rotations/rotations.routes'),
  },
  {
    path: 'facilities',
    data: { breadcrumb: 'pages.facility' },
    loadComponent: () => import('./facilities/facilities.component'),
  },
  {
    // Companies (inventory owners) of the operator — OWNER only
    path: 'companies',
    data: { breadcrumb: 'pages.companies' },
    loadComponent: () => import('./companies/companies.component'),
  },
  {
    path: 'packaging',
    data: { breadcrumb: 'pages.packaging' },
    loadComponent: () => import('./packaging/packaging.component'),
  },
  {
    // The company's look for every user — OWNER only
    path: 'appearance',
    data: { breadcrumb: 'pages.appearance' },
    loadComponent: () => import('./appearance/appearance.component'),
  },
  {
    path: 'addons',
    loadChildren: () => import('./addons/addons.routes'),
  },
] as Routes
