import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LayoutService } from '@/app/layout/service/layout.service';
import { AuthService } from '@/app/core/services/auth.service';
import { StyleClassModule } from 'primeng/styleclass';
import { ButtonModule } from 'primeng/button';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-picker-topbar',
  standalone: true,
  imports: [CommonModule, RouterModule, NgOptimizedImage, StyleClassModule, ButtonModule, TranslateModule],
  template: `
    <div class="layout-topbar picker-topbar">
      <a class="app-logo" routerLink="/">
        <img alt="app logo" [src]="logo()" width="52" height="52" />
      </a>

      <div class="topbar-actions ml-auto">
        <div class="topbar-profile">
          <button
            class="topbar-profile-button"
            type="button"
            pStyleClass="@next"
            enterFromClass="hidden"
            enterActiveClass="animate-scalein"
            leaveToClass="hidden"
            leaveActiveClass="animate-fadeout"
            [hideOnOutsideClick]="true"
          >
            <img alt="avatar" [src]="avatarUrl()" class="profile-image-avatar" />
            <span class="profile-details">
              <span class="profile-name">{{ username() }}</span>
              <span class="profile-job">{{ role() }}</span>
            </span>
            <i class="pi pi-angle-down"></i>
          </button>
          <ul
            class="list-none hidden p-2 sm:p-4 m-0 rounded-border shadow absolute bg-surface-0 dark:bg-surface-900 origin-top mt-2 right-0 top-auto"
            style="width: 15rem; z-index: 1100;"
          >
            <li>
              <a
                class="flex p-2 rounded-border w-full items-center hover:bg-emphasis transition-colors duration-150 cursor-pointer"
                (click)="logout()"
              >
                <i class="pi pi-sign-out mr-4"></i>
                <span>{{ 'topbar.logout' | translate }}</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .picker-topbar {
      height: 4rem;
      padding: 0 2rem;
      background: var(--surface-card);
      border-bottom: 1px solid var(--surface-border);
      display: flex;
      align-items: center;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      z-index: 999;
    }
  `]
})
export class PickerTopbar {
  layoutService = inject(LayoutService);
  authService = inject(AuthService);

  username = signal(this.authService.getUserName() || '');
  role = signal(this.authService.getAuthUserInfo()?.role || '');
  avatarUrl = signal(this.authService.getAvatar() || '/layout/images/avatar.png');

  logo = computed(() => {
    const path = '/layout/images/logo-';
    return path + (this.layoutService.isDarkTheme() ? 'light.png' : 'dark.png');
  });

  logout() {
    const user = this.authService.getAuthUserInfo();
    this.authService.logout(user?.id || '').subscribe();
  }
}
