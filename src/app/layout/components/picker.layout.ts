import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PickerTopbar } from './picker.topbar';
import { LayoutService } from '@/app/layout/service/layout.service';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-picker-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, PickerTopbar, ToastModule],
  template: `
    <p-toast></p-toast>
    <div class="layout-wrapper picker-layout-wrapper">
      <app-picker-topbar></app-picker-topbar>
      <div class="layout-content-wrapper" style="margin-left: 0; padding-top: 4rem;">
        <div class="layout-content">
          <router-outlet></router-outlet>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .picker-layout-wrapper {
      background: var(--surface-ground);
      min-height: 100vh;
    }
    .layout-content {
      padding: 2rem;
    }
  `]
})
export class PickerLayout implements OnInit {
  layoutService = inject(LayoutService);

  ngOnInit() {
    // Ensure sidebar is closed and we are in a clean state
    this.layoutService.layoutState.update(prev => ({
      ...prev,
      staticMenuInactive: true,
      overlayMenuActive: false,
      mobileMenuActive: false
    }));
  }
}
