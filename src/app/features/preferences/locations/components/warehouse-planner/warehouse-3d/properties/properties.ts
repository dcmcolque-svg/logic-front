import {
  Component,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Warehouse3dStateService } from '../../services/warehouse-3d-state.service';

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-warehouse-3d-properties',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './properties.html',
  styleUrl: './properties.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Warehouse3dPropertiesComponent {

  readonly state = inject(Warehouse3dStateService);

  // ─── Unit helpers ─────────────────────────────────────────────────────────

  /** Returns the whole-foot part of a metric value, preserving sign. */
  getFt(val: number): number {
    const absVal = Math.abs(val);
    const ft     = Math.floor(absVal);
    const sign   = val < 0 ? -1 : 1;
    return (ft === 0 && sign < 0) ? -0 : ft * sign;
  }

  /** Returns the remaining inches (0–11.5 in 0.5 steps) of a metric value. */
  getIn(val: number): number {
    const absVal = Math.abs(val);
    const ft     = Math.floor(absVal);
    return Math.round((absVal - ft) * 12 * 2) / 2;
  }

  /** Converts radians to degrees, rounded to 2 decimal places. */
  getDeg(rad: number): number {
    return Number.parseFloat((rad * (180 / Math.PI)).toFixed(2));
  }

  // ─── Update methods ───────────────────────────────────────────────────────

  updateFtIn(
    prop: 'position' | 'scaling',
    axis: 'x' | 'y' | 'z',
    ft: number,
    inc: number,
  ): void {
    const feet   = ft  ?? 0;
    const inches = inc ?? 0;
    const sign = feet < 0 || Object.is(feet, -0) ? -1 : 1;
    const val  = (Math.abs(feet) + inches / 12) * sign;
    this.state.updateTransform(prop, axis, val);
  }

  updateDeg(axis: 'x' | 'y' | 'z', deg: number): void {
    if (deg === null || deg === undefined) return;
    this.state.updateTransform('rotation', axis, deg * (Math.PI / 180));
  }

  updateName(name: string): void {
    this.state.updateName(name);
  }

  action(type: 'duplicate' | 'delete'): void {
    this.state.actionCommand$.next({ type });
  }
}
