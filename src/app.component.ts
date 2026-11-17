import { Component, HostListener, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import { AuthService } from '@/app/core/services/auth.service'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule],
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent {
  private readonly authService = inject(AuthService)

  /**
   * Fires when the page is loaded from the browser's back/forward cache (bfcache).
   * This protects against navigating back into protected routes after logout.
   */
  @HostListener('window:pageshow', ['$event'])
  async onPageShow(event: PageTransitionEvent) {
    if (event.persisted) {
      await this.authService.loadAuthInfo()
      if (!this.authService.isAuthenticated()) {
        this.authService.redirectTologin()
      }
    }
  }
}
