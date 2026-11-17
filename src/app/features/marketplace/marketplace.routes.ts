import { Routes } from '@angular/router'
import { MarketplaceComponent } from './marketplace.component'

export default [
  {
    path: '',
    component: MarketplaceComponent,
    data: { breadcrumb: 'Marketplace' },
  },
] as Routes
