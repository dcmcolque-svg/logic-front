import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ButtonModule } from 'primeng/button'
import { AuthService } from '@/app/core/services/auth.service'

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bg-surface-50 dark:bg-surface-950 flex items-center justify-center min-h-screen min-w-screen overflow-hidden"
    >
      <div class="flex flex-col items-center justify-center">
        <div style="border-radius: 56px; padding: 0.3rem;">
          <div
            class="w-full bg-surface-0 dark:bg-surface-900 py-12 px-8 sm:px-12 flex flex-col items-center"
            style="border-radius: 53px"
          >
            <div
              class="flex justify-center items-center bg-blue-500 rounded-full"
              style="width: 3.2rem; height: 3.2rem;"
            >
              <i class="pi pi-lock text-white text-4xl"></i>
            </div>
            <h1
              class="text-surface-900 dark:text-surface-0 font-bold text-4xl mb-2"
            >
              No Permissions
            </h1>
            <div class="text-muted-color mb-6">
              You don't have permissions to access this application
            </div>
            <div class="text-center mb-6">
              <p class="text-surface-700 dark:text-surface-300 text-lg mb-4">
                Hello <strong>{{ userName }}</strong
                >,
              </p>
              <p class="text-muted-color leading-6">
                Your account does not have the necessary permissions to access
                any section of the application.
                <br />
                Please contact your account administrator
                <strong>{{ accountName }}</strong> to request the appropriate
                permissions.
              </p>
            </div>
            <div class="flex gap-2">
              <p-button
                label="Sign Out"
                icon="pi pi-sign-out"
                (onClick)="logout()"
                [outlined]="true"
                severity="secondary"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AccessDenied {
  private readonly authService = inject(AuthService)

  accountName = this.authService.getAccountName()
  userName = this.authService.getAuthUserInfo()?.user_name || 'User'

  logout() {
    const userId = this.authService.getAuthUserInfo()?.id || 0
    this.authService.logout(userId).subscribe()
  }
}
