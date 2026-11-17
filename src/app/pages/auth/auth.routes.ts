import { Routes } from '@angular/router'
import { AccessDenied } from './accessdenied'
import { Error } from './error'

export default [
  { path: 'error', component: Error },
  { path: 'access', component: AccessDenied },
  { path: '**', redirectTo: '/notfound' },
] as Routes
