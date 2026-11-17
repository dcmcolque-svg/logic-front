import { Routes } from '@angular/router'

export default [
    {
        path: '',
        data: { breadcrumb: 'pages.reports' },
        loadComponent: () => import('./reports/reports.component'),
    }
] as Routes
