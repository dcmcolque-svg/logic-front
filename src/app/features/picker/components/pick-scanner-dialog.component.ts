import {
  Component, EventEmitter, Input, Output, OnDestroy,
  signal, ElementRef, ViewChild, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { Html5ScannerController } from './html5-scanner.controller';

/**
 * Pick verification scanner dialog.
 * Shows what value is expected and validates the scanned barcode against it.
 * Emits (verified) on match or (failed) with the scanned value on mismatch.
 */
@Component({
  selector: 'app-pick-scanner-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="stepLabel || 'Scan Barcode'"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '480px' }"
      [dismissableMask]="true"
      (onShow)="onDialogShow()"
      (onHide)="onDialogHide()">

      <div class="scanner-body">
        <!-- What we expect (hidden in manual mode) -->
        @if (!manualInput) {
          @if (acceptAny) {
            <div class="expected-banner accept-any">
              <i class="pi pi-qrcode"></i>
              <span>Scan any barcode</span>
            </div>
          } @else {
            <div class="expected-banner">
              <i class="pi pi-search"></i>
              <span>Expected: <strong>{{ expectedValue }}</strong></span>
            </div>
          }
        }

        @if (errorMsg()) {
          <div class="scanner-error">
            <i class="pi pi-exclamation-triangle"></i>
            <span>{{ errorMsg() }}</span>
          </div>
        }

        <!-- Camera mode -->
        @if (!manualInput) {
          <div id="pick-barcode-reader" #readerEl class="reader-viewport"></div>
        }

        <!-- Manual input mode -->
        @if (manualInput) {
          <div class="manual-input-section">
            <div class="manual-input-icon" [ngClass]="'type-' + scanType">
              @switch (scanType) {
                @case ('location') { <i class="pi pi-map-marker"></i> }
                @case ('sku')      { <i class="pi pi-box"></i> }
                @case ('tote')     { <i class="pi pi-cart-arrow-down"></i> }
              }
            </div>
            <label class="manual-input-label" for="pick-manual-input">Type the code and press Enter</label>
            <div class="manual-input-row">
              <input
                #manualInputEl
                id="pick-manual-input"
                type="text"
                class="manual-input-field"
                [(ngModel)]="manualValue"
                (keydown.enter)="onManualSubmit()"
                placeholder="Enter code…"
                autocomplete="off" />
              <button class="manual-submit-btn" (click)="onManualSubmit()">
                <i class="pi pi-check"></i>
              </button>
            </div>
          </div>
        }

        @if (lastScanned()) {
          <div class="scanned-result" [class.success]="scanSuccess()" [class.fail]="!scanSuccess()">
            <i [class]="scanSuccess() ? 'pi pi-check-circle' : 'pi pi-times-circle'"></i>
            <span>Scanned: <strong>{{ lastScanned() }}</strong></span>
          </div>
        }
      </div>

      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" icon="pi pi-times" (onClick)="close()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    .scanner-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .expected-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 8px;
      background: #eff6ff;
      color: #2563eb;
      font-size: 0.875rem;
      border: 1px solid #bfdbfe;

      &.accept-any {
        background: #f0fdf4;
        color: #16a34a;
        border-color: #bbf7d0;
      }
    }

    .reader-viewport {
      width: 100%;
      min-height: 300px;
      border-radius: 12px;
      overflow: hidden;
      background: #1a1a2e;
    }

    .scanner-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 8px;
      background: #fef2f2;
      color: #dc2626;
      font-size: 0.875rem;
    }

    .scanned-result {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.875rem;
      animation: fadeIn 0.3s ease;

      &.success {
        background: #f0fdf4;
        color: #16a34a;
      }

      &.fail {
        background: #fef2f2;
        color: #dc2626;
      }
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .manual-input-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 28px 16px;
      background: var(--surface-ground, #f8fafc);
      border: 1px solid var(--surface-border, #e2e8f0);
      border-radius: 12px;
    }

    .manual-input-icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-size: 1.4rem;

      &.type-location {
        background: #dbeafe;
        color: #2563eb;
      }
      &.type-sku {
        background: #e0e7ff;
        color: #4338ca;
      }
      &.type-tote {
        background: #fef3c7;
        color: #92400e;
      }
    }

    .manual-input-label {
      font-size: 0.82rem;
      color: var(--text-color-secondary, #6b7280);
      font-weight: 500;
    }

    .manual-input-row {
      display: flex;
      gap: 8px;
      width: 100%;
    }

    .manual-input-field {
      flex: 1;
      padding: 10px 14px;
      border: 2px solid var(--surface-border, #e2e8f0);
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 600;
      letter-spacing: 0.03em;
      outline: none;
      transition: border-color 0.15s ease;

      &:focus {
        border-color: var(--primary-color, #3b82f6);
      }
    }

    .manual-submit-btn {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--primary-color, #3b82f6);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 1.1rem;
      cursor: pointer;
      transition: background 0.15s ease;
      flex-shrink: 0;

      &:hover {
        filter: brightness(1.1);
      }
    }
  `]
})
export class PickScannerDialogComponent implements OnDestroy {
  private _visible = false;

  @Input()
  get visible(): boolean { return this._visible; }
  set visible(val: boolean) {
    const wasHidden = !this._visible;
    this._visible = val;
    if (val && wasHidden) {
      this.errorMsg.set(null);
      this.lastScanned.set(null);
      this.scanSuccess.set(false);
      // Scanner starts via (onShow) event when dialog is fully rendered
    } else if (!val) {
      this.stopScanner();
    }
  }

  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() stepLabel = 'Scan Barcode';
  @Input() expectedValue = '';
  @Input() acceptAny = false;
  @Input() manualInput = false;
  @Input() scanType: 'sku' | 'location' | 'tote' = 'sku';
  @Output() verified = new EventEmitter<void>();
  @Output() failed = new EventEmitter<string>();

  @ViewChild('readerEl') readerEl!: ElementRef<HTMLDivElement>;
  @ViewChild('manualInputEl') manualInputEl?: ElementRef<HTMLInputElement>;

  readonly errorMsg = signal<string | null>(null);
  readonly lastScanned = signal<string | null>(null);
  readonly scanSuccess = signal(false);
  manualValue = '';

  private readonly scanner = new Html5ScannerController('pick-barcode-reader');

  open() {
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.stopScanner();
    this.manualValue = '';
    this.visible = false;
    this.visibleChange.emit(false);
  }

  onDialogShow() {
    if (this.manualInput) {
      setTimeout(() => this.manualInputEl?.nativeElement?.focus(), 100);
    } else {
      this.startScanner();
    }
  }

  onManualSubmit() {
    const val = this.manualValue.trim();
    if (!val) return;
    this.onScanResult(val);
    this.manualValue = '';
  }

  private async startScanner() {
    const error = await this.scanner.start(decodedText => this.onScanResult(decodedText));
    if (error) {
      this.errorMsg.set(error);
    }
  }

  private onScanResult(decodedText: string) {
    this.lastScanned.set(decodedText);

    const match = this.acceptAny || decodedText.trim().toLowerCase() === this.expectedValue.trim().toLowerCase();
    this.scanSuccess.set(match);

    this.stopScanner();

    if (match) {
      this.verified.emit();
      // Don't auto-close — parent will either advance to next step or close
    } else {
      this.failed.emit(decodedText);
      // Re-open scanner after a brief pause to let user see the error
      setTimeout(() => {
        this.lastScanned.set(null);
        this.startScanner();
      }, 1500);
    }
  }

  /** Called by parent to restart scanner with updated step (without closing dialog) */
  restartScanner() {
    this.errorMsg.set(null);
    this.lastScanned.set(null);
    this.scanSuccess.set(false);
    this.manualValue = '';
    if (this.manualInput) {
      setTimeout(() => this.manualInputEl?.nativeElement?.focus(), 100);
    } else {
      setTimeout(() => this.startScanner(), 300);
    }
  }

  private stopScanner() {
    return this.scanner.stop();
  }

  onDialogHide() {
    this.stopScanner();
    this.visibleChange.emit(false);
  }

  ngOnDestroy() {
    this.stopScanner();
  }
}
