import {
  Component,
  OnInit,
  inject,
  signal,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { GatewayService, GatewayIntentData, Company } from '@/app/core/services/gateway.service'
import { environment } from '../../../environments/environment'

// Extend the global scope to include the $gtconfig function exposed by the IONFLOW CDN script.
declare global {
  var $gtconfig: (config: {
    url: string
    secret?: string
    ion_url?: string
    ion_bin_url?: string
    gateway_id?: number | string
    gateway_key?: string
  }) => void
}

type Phase = 'loading-companies' | 'selecting-company' | 'loading-token' | 'ready' | 'error'
type Tab = 'channels' | 'marketplace'

@Component({
  selector: 'app-marketplace',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="marketplace-wrapper">

      <!-- ── Loading companies ──────────────────────────────────────────────── -->
      @if (phase() === 'loading-companies') {
        <div class="marketplace-center">
          <div class="marketplace-spinner">
            <i class="pi pi-spin pi-spinner"></i>
            <span>Loading…</span>
          </div>
        </div>
      }

      <!-- ── Company selector ───────────────────────────────────────────────── -->
      @if (phase() === 'selecting-company') {
        <div class="company-selector-wrapper">
          <div class="company-selector-container">
            <div class="company-selector-header">
              <div class="company-selector-icon">
                <i class="pi pi-th-large"></i>
              </div>
              <h2 class="company-selector-title">Select a Company</h2>
              <p class="company-selector-subtitle">
                Choose which company you want to manage in the Marketplace
              </p>
            </div>

            <div class="company-cards-grid">
              @for (company of companies(); track company.id) {
                <button
                  class="company-card"
                  (click)="selectCompany(company)"
                  [id]="'company-card-' + company.id"
                >
                  <div class="company-card-avatar">
                    {{ getInitials(company.name) }}
                  </div>
                  <div class="company-card-info">
                    <span class="company-card-name">{{ company.name }}</span>
                    @if (company.tax_id) {
                      <span class="company-card-taxid">{{ company.tax_id }}</span>
                    }
                  </div>
                  <i class="pi pi-arrow-right company-card-arrow"></i>
                </button>
              }
            </div>
          </div>
        </div>
      }

      <!-- ── Loading intent token ───────────────────────────────────────────── -->
      @if (phase() === 'loading-token') {
        <div class="marketplace-center">
          <div class="marketplace-spinner">
            <i class="pi pi-spin pi-spinner"></i>
            <span>Connecting to Marketplace…</span>
          </div>
        </div>
      }

      <!-- ── Marketplace ready — tabbed view ─────────────────────────────────── -->
      @if (phase() === 'ready') {
        <div class="marketplace-frame">
          <div class="marketplace-topbar">
            <span class="marketplace-company-label">
              <i class="pi pi-building"></i>
              {{ selectedCompany()?.name }}
            </span>
            <div class="marketplace-tabs">
              <button
                class="marketplace-tab"
                [class.active]="activeTab() === 'channels'"
                (click)="activeTab.set('channels')"
              >
                <i class="pi pi-list"></i> Configured Channels
              </button>
              <button
                class="marketplace-tab"
                [class.active]="activeTab() === 'marketplace'"
                (click)="activeTab.set('marketplace')"
              >
                <i class="pi pi-shop"></i> Available Marketplace
              </button>
            </div>
            <button class="marketplace-change-btn" (click)="changeCompany()">
              <i class="pi pi-refresh"></i>
              Change Company
            </button>
          </div>

          <div class="marketplace-content">
            <!-- Both components stay in DOM; toggle visibility with [hidden] -->
            <div class="gt-component-container" id="gt-channel-container"
                 [hidden]="activeTab() !== 'channels'"></div>
            <div class="gt-component-container" id="gt-service-container"
                 [hidden]="activeTab() !== 'marketplace'"></div>
          </div>
        </div>
      }

      <!-- ── Error state ────────────────────────────────────────────────────── -->
      @if (phase() === 'error') {
        <div class="marketplace-center">
          <div class="marketplace-error">
            <i class="pi pi-exclamation-triangle error-icon"></i>
            <p class="marketplace-error-text">{{ errorMessage() }}</p>
            <button class="marketplace-retry-btn" (click)="retry()">
              <i class="pi pi-refresh"></i> Retry
            </button>
          </div>
        </div>
      }

    </div>
  `,
  styleUrl: './marketplace.component.scss',
})
export class MarketplaceComponent implements OnInit {
  private readonly gatewayService = inject(GatewayService)

  phase = signal<Phase>('loading-companies')
  companies = signal<Company[]>([])
  selectedCompany = signal<Company | null>(null)
  intentData = signal<GatewayIntentData | null>(null)
  errorMessage = signal<string | null>(null)
  activeTab = signal<Tab>('channels')

  ngOnInit(): void {
    this.loadCompanies()
  }

  // ── Step 1: Load companies ──────────────────────────────────────────────────

  loadCompanies(): void {
    this.phase.set('loading-companies')
    this.gatewayService.getCompanies().subscribe({
      next: (resp) => {
        const list = resp?.data ?? []
        this.companies.set(list)

        if (list.length === 0) {
          this.showError('No companies found for this operator.')
          return
        }

        // Auto-select if there is only one company.
        if (list.length === 1) {
          this.selectCompany(list[0])
        } else {
          this.phase.set('selecting-company')
        }
      },
      error: (err) => {
        this.showError(err?.error?.message ?? err?.message ?? 'Failed to load companies.')
      },
    })
  }

  // ── Step 2: Company selected → fetch intent token ───────────────────────────

  selectCompany(company: Company): void {
    this.selectedCompany.set(company)
    this.phase.set('loading-token')

    this.gatewayService.getIntentToken(company.id).subscribe({
      next: (resp) => {
        this.intentData.set(resp)
        this.configureAndMount(resp)
      },
      error: (err) => {
        const msg = err?.error?.message ?? err?.message ?? 'Could not connect to the Marketplace.'
        this.showError(msg)
      },
    })
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  changeCompany(): void {
    this.selectedCompany.set(null)
    this.intentData.set(null)
    if (this.companies().length > 1) {
      this.phase.set('selecting-company')
    } else {
      this.loadCompanies()
    }
  }

  retry(): void {
    if (this.selectedCompany()) {
      this.selectCompany(this.selectedCompany()!)
    } else {
      this.loadCompanies()
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  }

  /**
   * Loads the IONFLOW CDN script (if not already loaded), then configures
   * the SDK and mounts the web components.
   */
  private configureAndMount(data: GatewayIntentData): void {
    this.loadCdnScript().then(() => {
      if (typeof globalThis.$gtconfig !== 'function') {
        this.showError('Marketplace SDK could not be loaded. Please refresh the page.')
        return
      }

      globalThis.$gtconfig({
        url: data.gateway_url,
        secret: data.token,
        ion_url: data.ion_url,
        ion_bin_url: data.ion_bin_url,
        gateway_id: data.gateway_id,
      })

      this.phase.set('ready')
      setTimeout(() => this.mountComponents(), 50)
    })
  }

  /** Dynamically loads the IONFLOW CDN script once. */
  private loadCdnScript(): Promise<void> {
    const src = environment.ionflowCdnUrl
    if (document.querySelector(`script[src="${src}"]`)) {
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load IONFLOW SDK'))
      document.head.appendChild(script)
    })
  }

  /** Mounts <gt-channel-list> and <gt-service-list> with the intent token. */
  private mountComponents(): void {
    const token = this.intentData()?.token ?? ''

    this.mountElement('gt-channel-container', 'gt-channel-list', token)
    this.mountElement('gt-service-container', 'gt-service-list', token)
  }

  /** Creates a Gateway custom element inside a container if not already present. */
  private mountElement(containerId: string, tagName: string, secret: string): void {
    const container = document.getElementById(containerId)
    if (!container || container.querySelector(tagName)) return

    const el = document.createElement(tagName)
    el.setAttribute('secret', secret)
    container.appendChild(el)
  }

  private showError(message: string): void {
    this.errorMessage.set(message)
    this.phase.set('error')
  }
}
