import { Component, inject } from '@angular/core'
import { LayoutService } from '@/app/layout/service/layout.service'

@Component({
  standalone: true,
  selector: '[app-footer]',
  template: ``,
  host: {
    class: 'layout-footer',
  },
})
export class AppFooter {
  layoutService = inject(LayoutService)
}
