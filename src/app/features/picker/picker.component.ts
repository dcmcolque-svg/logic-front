import { Component, inject, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PickerService, PickerOrder } from './services/picker.service';
import { WarehousePlannerComponent } from '../preferences/locations/components/warehouse-planner/warehouse-planner';
import { Warehouse2dStateService } from '../preferences/locations/components/warehouse-planner/services/warehouse-2d-state.service';
import { PickingRouteService } from '../preferences/locations/components/warehouse-planner/services/picking-route.service';
import { BarcodeScannerDialogComponent } from './components/barcode-scanner-dialog.component';
import { Facility } from '../preferences/locations/types/location.types';

@Component({
  selector: 'app-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, AutoCompleteModule, ButtonModule, WarehousePlannerComponent, BarcodeScannerDialogComponent, SelectModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="picker-container">
      @if (!isInPickingMode()) {
        <div class="selection-screen animate-fadein">
          <div class="selection-card shadow-xl">
            <h1 class="text-3xl font-bold mb-2">Select your orders</h1>
            <p class="text-surface-500 mb-8">Choose a facility, then pick one or more orders to start.</p>

            @if (pickerService.loading()) {
              <div class="loading-indicator mb-6">
                <i class="pi pi-spin pi-spinner" style="font-size: 1.5rem"></i>
                <span>Loading facilities...</span>
              </div>
            } @else {

            <!-- Step 1: Facility Dropdown -->
            <div class="step-label mb-2">
              <span class="step-number">1</span>
              <span>Select Facility</span>
            </div>
            <p-select
              [options]="pickerService.facilities()"
              [(ngModel)]="selectedFacility"
              optionLabel="name"
              placeholder="Choose a facility…"
              styleClass="w-full mb-6"
              (onChange)="onFacilitySelected($event)" />

            <!-- Step 2: Order selection (chips autocomplete) -->
            @if (pickerService.selectedFacilityId()) {
              <div class="step-label mb-2">
                <span class="step-number">2</span>
                <span>Select Orders</span>
              </div>
              <div class="autocomplete-wrapper mb-4">
                <div class="input-row">
                  <p-autoComplete
                    [(ngModel)]="currentOrderInput"
                    [suggestions]="filteredOrders"
                    (completeMethod)="searchOrders($event)"
                    optionLabel="id"
                    placeholder="Type or scan Order ID…"
                    [dropdown]="true"
                    [forceSelection]="true"
                    styleClass="w-full"
                    inputStyleClass="w-full"
                    (onSelect)="onOrderSelected($event)">

                    <ng-template let-order pTemplate="item">
                      <div class="flex flex-col gap-1 py-1">
                        <span class="font-bold">{{ order.id }}</span>
                        <span class="text-xs text-surface-500">{{ order.itemsCount }} SKUs</span>
                      </div>
                    </ng-template>

                  </p-autoComplete>

                  <p-button
                    icon="pi pi-camera"
                    severity="secondary"
                    [rounded]="true"
                    [text]="true"
                    pTooltip="Scan with camera"
                    tooltipPosition="top"
                    (click)="openCameraScanner()"
                    class="camera-btn" />
                </div>

                <div class="scan-indicator" [class.scanning]="scanBuffer.length > 0">
                  <i class="pi pi-barcode"></i>
                  <span class="scan-label">Scanner Ready</span>
                  <span class="scan-divider">•</span>
                  <i class="pi pi-camera"></i>
                  <span class="scan-label">Camera Available</span>
                </div>
              </div>

              <!-- Selected orders box (collapsible) -->
              @if (selectedOrders.length > 0) {
                <div class="selected-orders-box mb-4">
                  <button class="selected-orders-header" (click)="ordersExpanded = !ordersExpanded">
                    <span class="selected-orders-label">Selected Orders ({{ selectedOrders.length }})</span>
                    <span class="selected-orders-toggle">
                      {{ ordersExpanded ? 'Hide' : 'View' }}
                      <i [class]="ordersExpanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"></i>
                    </span>
                  </button>
                  @if (ordersExpanded) {
                    <div class="selected-orders-chips">
                      @for (order of selectedOrders; track order.id) {
                        <div class="selected-order-chip">
                          <i class="pi pi-box"></i>
                          <span class="chip-id">{{ order.id }}</span>
                          <span class="chip-skus">{{ order.itemsCount }} SKUs</span>
                          <button class="chip-remove" (click)="removeOrder(order); $event.stopPropagation()">
                            <i class="pi pi-times"></i>
                          </button>
                        </div>
                      }
                    </div>
                  }
                </div>
              }

              <app-barcode-scanner-dialog
                #scannerDialog
                (scanned)="onCameraScanned($event)" />

              <p-button 
                label="Start Picking" 
                icon="pi pi-play" 
                class="w-full"
                [disabled]="selectedOrders.length === 0"
                (click)="onStartPicking()"/>
            }
            }
          </div>
        </div>
      } @else {
        <div class="picking-view animate-fadein">
          <app-warehouse-planner [isStandalonePicker]="true" />
          
          <button class="back-btn" (click)="onBack()">
            <i class="pi pi-arrow-left mr-2"></i> Change Order
          </button>

          @if (pickingService.allPicked()) {
            <div class="completion-banner animate-fadein">
              <i class="pi pi-check-circle" style="color:#10B981;font-size:1.25rem"></i>
              <span>Order complete — all picks collected!</span>
              <p-button 
                label="Select Another Order" 
                icon="pi pi-arrow-right" 
                severity="success"
                size="small"
                (click)="onBack()" />
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .picker-container {
      width: 100%;
      height: calc(100vh - 8rem);
      display: flex;
      flex-direction: column;
    }

    .selection-screen {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      border-radius: 12px;
      margin: -2rem;
      height: calc(100vh - 4rem);
    }

    .selection-card {
      width: 100%;
      max-width: 500px;
      padding: 3rem;
      background: white;
      border-radius: 16px;
      text-align: center;
    }

    .loading-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 20px;
      color: var(--text-color-secondary, #6b7280);
      font-size: 0.95rem;
    }

    .autocomplete-wrapper {
      position: relative;
    }

    .input-row {
      display: flex;
      align-items: center;
      gap: 8px;

      p-autoComplete {
        flex: 1;
      }

      .camera-btn {
        flex-shrink: 0;
      }
    }

    .scan-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.8rem;
      color: var(--text-color-secondary, #6b7280);
      background: var(--surface-ground, #f3f4f6);
      transition: all 0.3s ease;
      justify-content: center;

      .pi-barcode, .pi-camera {
        font-size: 1rem;
      }

      .scan-divider {
        margin: 0 4px;
        opacity: 0.4;
      }

      &.scanning {
        color: var(--primary-color, #3b82f6);
        background: var(--primary-50, #eff6ff);
        font-weight: 600;
      }
    }

    .picking-view {
      position: relative;
      flex: 1;
      height: 100%;
    }

    .back-btn {
      position: absolute;
      top: 15px;
      left: 15px;
      z-index: 1000;
      background: white;
      border: 1px solid var(--surface-border);
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      display: flex;
      align-items: center;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
      transition: all 0.2s;
      &:hover {
        background: var(--surface-hover);
        transform: translateY(-1px);
      }
    }

    .step-label {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-color-secondary, #6b7280);
      text-align: left;
    }

    .step-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--primary-color, #3b82f6);
      color: white;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .completion-banner {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1500;
      display: flex;
      align-items: center;
      gap: 12px;
      background: white;
      border: 1px solid #10B981;
      border-radius: 12px;
      padding: 12px 20px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      font-weight: 600;
      white-space: nowrap;
    }

    .selected-orders-box {
      border: 1px solid var(--surface-border, #e2e8f0);
      border-radius: 12px;
      padding: 0;
      background: var(--surface-ground, #f8fafc);
      overflow: hidden;
    }

    .selected-orders-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 10px 14px;
      background: transparent;
      border: none;
      cursor: pointer;
      transition: background 0.15s ease;

      &:hover {
        background: rgba(0, 0, 0, 0.03);
      }
    }

    .selected-orders-label {
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--text-color-secondary, #6b7280);
    }

    .selected-orders-toggle {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--primary-color, #3b82f6);
      display: flex;
      align-items: center;
      gap: 4px;

      i { font-size: 0.7rem; }
    }

    .selected-orders-chips {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 0 12px 12px;
      animation: chipIn 0.2s ease;
    }

    .selected-order-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      transition: all 0.15s ease;
      animation: chipIn 0.2s ease;

      .pi-box {
        color: var(--primary-color, #3b82f6);
        font-size: 0.9rem;
      }

      .chip-id {
        font-weight: 700;
        font-size: 0.85rem;
        color: #1e293b;
      }

      .chip-skus {
        font-size: 0.72rem;
        color: var(--text-color-secondary, #94a3b8);
        margin-left: auto;
      }

      .chip-remove {
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: #94a3b8;
        cursor: pointer;
        transition: all 0.15s ease;
        font-size: 0.7rem;
        flex-shrink: 0;

        &:hover {
          background: #fef2f2;
          color: #ef4444;
        }
      }
    }

    @keyframes chipIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class PickerComponent implements OnInit, OnDestroy {
  readonly pickerService = inject(PickerService);
  private readonly stateService = inject(Warehouse2dStateService);
  readonly pickingService = inject(PickingRouteService);
  private readonly messageService = inject(MessageService);

  @ViewChild('scannerDialog') scannerDialog!: BarcodeScannerDialogComponent;

  orders = this.pickerService.ordersForFacility;
  selectedOrders: PickerOrder[] = [];
  currentOrderInput: PickerOrder | null = null;
  selectedFacility: Facility | null = null;
  ordersExpanded = false;

  /** True when we're in picking mode (orders selected and picking started) */
  isInPickingMode = this.pickerService.hasSelection;

  // AutoComplete filtered suggestions
  filteredOrders: PickerOrder[] = [];

  // ── Hardware Barcode Scanner (Keyboard Wedge) ─────────────────────
  scanBuffer = '';
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly SCAN_CHAR_THRESHOLD_MS = 50;
  private readonly SCAN_MIN_LENGTH = 4;

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    // Skip if user is already in picking mode
    if (this.isInPickingMode()) return;

    // Ignore modifier keys and special keys (except Enter)
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    if (event.key === 'Enter' && this.scanBuffer.length >= this.SCAN_MIN_LENGTH) {
      event.preventDefault();
      this.processScan(this.scanBuffer);
      this.resetScanBuffer();
      return;
    }

    // Only accumulate printable single characters
    if (event.key.length === 1) {
      if (this.scanTimer) clearTimeout(this.scanTimer);
      this.scanBuffer += event.key;
      this.scanTimer = setTimeout(() => {
        this.resetScanBuffer();
      }, this.SCAN_CHAR_THRESHOLD_MS);
    }
  }

  private processScan(code: string) {
    const trimmed = code.trim().toLowerCase();

    const match = this.pickerService.ordersForFacility().find(
      o => o.id.toLowerCase() === trimmed
    );

    if (match && !this.selectedOrders.some(o => o.id === match.id)) {
      this.selectedOrders = [...this.selectedOrders, match];
    } else if (!match) {
      this.messageService.add({
        severity: 'error',
        summary: 'Order not found',
        detail: `No order matching "${code.trim()}" was found in this facility.`,
        life: 4000,
      });
    }
  }

  private resetScanBuffer() {
    this.scanBuffer = '';
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }

  ngOnInit() {
    this.pickerService.loadFacilitiesAndOrders();
  }

  // ── Facility selection ────────────────────────────────────────────

  onFacilitySelected(event: any) {
    const facility = event.value;
    this.pickerService.selectFacility(facility?.id ?? null);
    this.selectedOrders = [];
    this.currentOrderInput = null;
    this.filteredOrders = [];
  }

  // ── AutoComplete search ───────────────────────────────────────────

  searchOrders(event: { query: string }) {
    const query = event.query.toLowerCase();
    const selectedIds = new Set(this.selectedOrders.map(o => o.id));
    this.filteredOrders = this.pickerService.ordersForFacility().filter(o =>
      o.id.toLowerCase().includes(query) && !selectedIds.has(o.id)
    );
  }

  onOrderSelected(event: any) {
    const order: PickerOrder = event.value ?? event;
    if (order && !this.selectedOrders.some(o => o.id === order.id)) {
      this.selectedOrders = [...this.selectedOrders, order];
    }
    // Clear the input after selection
    setTimeout(() => { this.currentOrderInput = null; });
  }

  removeOrder(order: PickerOrder) {
    this.selectedOrders = this.selectedOrders.filter(o => o.id !== order.id);
  }

  // ── Camera Scanner ────────────────────────────────────────────────

  openCameraScanner() {
    this.scannerDialog.open();
  }

  onCameraScanned(code: string) {
    this.scannerDialog.close();
    this.processScan(code);
  }

  // ── Actions ───────────────────────────────────────────────────────

  onStartPicking() {
    if (this.selectedOrders.length > 0) {
      this.stateService.pickingMode.set(true);
      this.pickerService.selectOrders(this.selectedOrders.map(o => o.id));
    }
  }

  onBack() {
    this.pickerService.selectOrders([]);
    this.stateService.pickingMode.set(false);
    this.stateService.panLockMode.set(false);
    this.selectedOrders = [];
  }

  ngOnDestroy() {
    this.resetScanBuffer();
  }
}
