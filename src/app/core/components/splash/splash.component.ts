import { Component, OnInit, inject } from '@angular/core'
import { Router } from '@angular/router'
import { AuthService } from '../../services/auth.service'

@Component({
  selector: 'app-splash',
  standalone: true,
  imports: [],
  templateUrl: './splash.component.html',
  styleUrls: ['./splash.component.scss'],
})
export default class SplashComponent implements OnInit {
  private readonly authService = inject(AuthService)
  private readonly router = inject(Router)

  ngOnInit(): void {
    this.initApp()
  }

  private initApp() {
    // authGuard already called loadAuthInfo() and verified the session.
    // We don't need to call it again — just read the already-populated signal.
    const user = this.authService.getAuthUserInfo()

    this.authService.getInformationData(user?.uid ?? '').subscribe({
      next: (data) => {
        this.authService.saveInformationData(data)

        // Navigate to the first route the user has permission for.
        // Falls back to /no-permissions if no matching activity is found.
        const firstRoute = this.authService.getFirstAvailableRoute()
        if (firstRoute) {
          this.router.navigate([firstRoute])
        } else {
          this.authService.goToNoPermissionsPage()
        }
      },
      error: (err: any) => {
        console.error('Error loading user data:', err)
        this.authService.redirectTologin()
      },
    })
  }
}
