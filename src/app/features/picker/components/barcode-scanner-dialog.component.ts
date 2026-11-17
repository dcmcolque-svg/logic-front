import {
  Component, EventEmitter, Output, OnDestroy,
  signal, ElementRef, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { Html5ScannerController } from './html5-scanner.controller';

@Component({
  selector: 'app-barcode-scanner-dialog',
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      header="Scan Barcode"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '480px' }"
      [dismissableMask]="true"
      (onShow)="onDialogShow()"
      (onHide)="onDialogHide()">

      <div class="scanner-body">
        @if (errorMsg()) {
          <div class="scanner-error">
            <i class="pi pi-exclamation-triangle"></i>
            <span>{{ errorMsg() }}</span>
          </div>
        }

        <div id="barcode-reader" #readerEl class="reader-viewport"></div>

        @if (lastScanned()) {
          <div class="scanned-result">
            <i class="pi pi-check-circle"></i>
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
      background: #f0fdf4;
      color: #16a34a;
      font-size: 0.875rem;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class BarcodeScannerDialogComponent implements OnDestroy {
  @Output() scanned = new EventEmitter<string>();
  @ViewChild('readerEl') readerEl!: ElementRef<HTMLDivElement>;
  private readonly cdr = inject(ChangeDetectorRef);

  visible = false;
  readonly errorMsg = signal<string | null>(null);
  readonly lastScanned = signal<string | null>(null);

  private readonly scanner = new Html5ScannerController('barcode-reader');

  open() {
    this.visible = true;
    this.errorMsg.set(null);
    this.lastScanned.set(null);
    this.cdr.markForCheck();
    // Scanner starts via (onShow) event when dialog is fully rendered
  }

  onDialogShow() {
    this.startScanner();
  }

  close() {
    this.stopScanner();
    this.visible = false;
  }

  private async startScanner() {
    const error = await this.scanner.start(decodedText => this.onScanSuccess(decodedText));
    if (error) {
      this.errorMsg.set(error);
    }
  }

  private onScanSuccess(decodedText: string) {
    this.lastScanned.set(decodedText);
    this.scanned.emit(decodedText);

    // Stop scanner after successful scan
    this.stopScanner();
    // Auto-close dialog after a brief moment to show the result
    setTimeout(() => {
      this.visible = false;
    }, 600);
  }

  private stopScanner() {
    return this.scanner.stop();
  }

  onDialogHide() {
    this.stopScanner();
  }

  ngOnDestroy() {
    this.stopScanner();
  }
}
