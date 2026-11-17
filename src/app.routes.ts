import { Routes } from '@angular/router'
import { AppLayout } from '@/app/layout/components/app.layout'
import { PickerLayout } from '@/app/layout/components/picker.layout'
import { authGuard } from './app/core/guards/auth.guard'

export const appRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./app/core/components/splash/splash.component'),
    canActivate: [authGuard],
  },
  {
    path: 'app',
    component: AppLayout,
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      {
        path: '',
        data: { breadcrumb: 'pages.dashboard' },
        loadComponent: () =>
          import('@/app/pages/dashboard/dashboard.component').then(
            (c) => c.DashboardComponent
          ),
      },
      {
        path: 'reports',
        loadChildren: () => import('@/app/features/reports/reports.routes'),
      },
      {
        path: 'pages',
        data: { breadcrumb: 'pages.pages' },
        loadChildren: () => import('@/app/pages/pages.routes'),
      },
      {
        path: 'preferences',
        data: { breadcrumb: 'pages.preferences' },
        loadChildren: () =>
          import('@/app/features/preferences/preferences.routes'),
      },
      {
        path: 'inbound',
        data: { breadcrumb: 'Inbound' },
        loadChildren: () =>
          import('@/app/features/inbound/inbound.routes'),
      },
      {
        path: 'outbound',
        data: { breadcrumb: 'pages.outbound' },
        loadChildren: () =>
          import('@/app/features/outbound/outbound.routes'),
      },{
        path: 'parcels',
        data: { breadcrumb: 'pages.parcels' },
        loadChildren: () => import('@/app/features/parcels/parcels.routes'),
      },
      {
        path: 'marketplace',
        data: { breadcrumb: 'Marketplace' },
        loadChildren: () =>
          import('@/app/features/marketplace/marketplace.routes'),
      },
      {
        path: 'inventory',
        data: { breadcrumb: 'Inventory' },
        loadChildren: () => import('@/app/features/inventory/inventory.routes'),
      },
    ],
  },
  {
    path: 'picker',
    component: PickerLayout,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('@/app/features/picker/picker.component').then(
            (m) => m.PickerComponent
          ),
      },
    ],
  },
  { path: 'auth', loadChildren: () => import('@/app/pages/auth/auth.routes') },
  {
    path: 'notfound',
    loadComponent: () =>
      import('@/app/pages/notfound/notfound').then((c) => c.Notfound),
  },
  {
    path: 'error',
    loadComponent: () => import('@/app/pages/auth/error').then((c) => c.Error),
  },
  {
    path: 'no-permissions',
    loadComponent: () =>
      import('@/app/pages/auth/accessdenied').then((c) => c.AccessDenied),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('@/app/pages/auth/login-landing/login-landing.component').then(
        (c) => c.LoginLandingComponent
      ),
  },
  { path: '**', redirectTo: '/notfound' },
]
