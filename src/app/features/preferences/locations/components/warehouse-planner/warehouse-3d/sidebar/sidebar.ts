import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Warehouse3dStateService } from '../../services/warehouse-3d-state.service';
import { Warehouse2dStateService } from '../../services/warehouse-2d-state.service';

// ─── Tab type ─────────────────────────────────────────────────────────────────
type SidebarTab = 'generate' | 'add' | 'draw';

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-warehouse-3d-sidebar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Warehouse3dSidebarComponent {

  readonly state   = inject(Warehouse3dStateService);
  private readonly state2d = inject(Warehouse2dStateService);

  // ── UI state ───────────────────────────────────────────────────────────────
  readonly activeTab = signal<SidebarTab>('generate');
  readonly isDrawing = signal(false);

  // ── Generate form ──────────────────────────────────────────────────────────
  genArea  = this.state2d.nextAreaName();
  genType  = 'Standard';
  genRInit = 1;
  genREnd  = 3;
  genBInit = 1;
  genBEnd  = 5;

  // ── Add item form ──────────────────────────────────────────────────────────
  addLocName  = '';
  addItemType = 'bin';

  // ─── Tab areas ────────────────────────────────────────────────────────────

  setTab(tab: SidebarTab): void {
    this.activeTab.set(tab);
  }

  // ─── Generate ─────────────────────────────────────────────────────────────

  /**
   * When the user changes the Area code, auto-advance col/row
   * to max+1 if the area already has Locs.
   */
  onGenAreaChange(areaCode: string): void {
    const maxes = this.state2d.getAreaMaxColRow(areaCode);
    if (!maxes) return;

    const colCount = Math.max(1, (this.genBEnd - this.genBInit) + 1);
    const rowCount = Math.max(1, (this.genREnd - this.genRInit) + 1);

    this.genBInit = maxes.maxCol + 1;
    this.genBEnd  = this.genBInit + colCount - 1;
    this.genRInit = maxes.maxRow + 1;
    this.genREnd  = this.genRInit + rowCount - 1;
  }

  onGenerate(e: SubmitEvent): void {
    e.preventDefault();
    this.state.generateCommand$.next({
      area:   this.genArea,
      type:   this.genType,
      rStart: this.genRInit,
      rEnd:   this.genREnd,
      bStart: this.genBInit,
      bEnd:   this.genBEnd,
    });
  }

  // ─── Add item ─────────────────────────────────────────────────────────────

  onAdd(e: SubmitEvent): void {
    e.preventDefault();
    this.state.createSingleCommand$.next({ name: this.addLocName, type: this.addItemType });
    this.addLocName = '';
  }

  // ─── Draw shape ───────────────────────────────────────────────────────────

  drawStart(): void {
    this.isDrawing.set(true);
    this.state.actionCommand$.next({ type: 'draw_start' });
  }

  drawFinish(): void {
    this.isDrawing.set(false);
    this.state.actionCommand$.next({ type: 'draw_finish' });
  }

  drawCancel(): void {
    this.isDrawing.set(false);
    this.state.actionCommand$.next({ type: 'draw_cancel' });
  }

  // ─── General actions ──────────────────────────────────────────────────────

  undo(): void {
    this.state.actionCommand$.next({ type: 'undo' });
  }

  selectMesh(id: string): void {
    this.state.selectMeshCommand$.next(id);
  }
}
