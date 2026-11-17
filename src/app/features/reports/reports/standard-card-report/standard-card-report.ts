import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { Report, ReportStructure } from '../reports.types';

@Component({
  selector: 'app-standard-card-report',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './standard-card-report.html',
  styleUrl: './standard-card-report.scss',
})
export class StandardCardReport implements OnInit {
  // ── Inputs ─────────────────────────────────────────────────────────────────
  @Input({ required: true }) report!: Report;
  @Input({ required: true }) reportStructure!: ReportStructure;

  // ── Computed colors ────────────────────────────────────────────────────────
  colorIcon           = '';
  backgroundColorIcon = '';

  ngOnInit(): void {
    if (this.report.color) {
      this.computeColors(this.report.color);
    }
  }

  private computeColors(hex: string): void {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return;
    this.colorIcon           = this.rgba(rgb, 0.8, 1);
    this.backgroundColorIcon = this.rgba(rgb, 1, 0.15);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m
      ? { r: Number.parseInt(m[1], 16), g: Number.parseInt(m[2], 16), b: Number.parseInt(m[3], 16) }
      : null;
  }

  private rgba(
    { r, g, b }: { r: number; g: number; b: number },
    factor: number,
    alpha: number,
  ): string {
    return `rgba(${Math.min(255, r * factor)}, ${Math.min(255, g * factor)}, ${Math.min(255, b * factor)}, ${alpha})`;
  }
}
