import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { TranslateService } from '@ngx-translate/core';

import {
  Warehouse2dStateService,
  GridItem,
} from '../../services/warehouse-2d-state.service';

// ─── Local Types ──────────────────────────────────────────────────────────────

interface SidebarTab {
  id: string;
  label: string;
}

interface ConveyorDir {
  key: 'north' | 'south' | 'east' | 'west';
  label: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-sidebar-2d',
  standalone: true,
  imports: [
    FormsModule,
    UpperCasePipe,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    TooltipModule,
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar2dComponent {

  readonly state = inject(Warehouse2dStateService);
  private readonly translate = inject(TranslateService);
  private warningTimer: any = null;

  // ── Tabs ───────────────────────────────────────────────────────────────────

  readonly tabs: SidebarTab[] = [
    { id: 'build', label: 'Build' },
  ];

  switchSidebarTab(id: string): void {
    // Exclusive-tab behaviour: close all then open the selected one
    this.tabs.forEach(t => {
      if (this.state.isPanelOpen(t.id) && t.id !== id) {
        this.state.togglePanel(t.id);
      }
    });
    if (!this.state.isPanelOpen(id)) {
      this.state.openPanel(id);
    }
  }

  // ── Item field helpers ─────────────────────────────────────────────────────

  updateSingle(field: keyof GridItem, value: unknown): void {
    const selected = this.state.selectedItems();
    if (selected.length !== 1) return;
    const item = selected[0];

    // ── Duplicate name check ─────────────────────────────────────────
    if (field === 'name' && typeof value === 'string' && value.trim().length > 0) {
      const nameUpper = value.trim().toUpperCase();
      const isDuplicate = this.state.items().some(i =>
        i.id !== item.id && i.type === 'Loc' && i.name.toUpperCase() === nameUpper
      );
      if (isDuplicate) {
        this.state.warningMessage.set(
          this.translate.instant('preferences.location.duplicate_name_warning', { name: value.trim() })
        );
        clearTimeout(this.warningTimer);
        this.warningTimer = setTimeout(() => this.state.warningMessage.set(null), 3000);
        return; // reject the rename
      }
    }

    this.state.items.update(items =>
      items.map(i => {
        if (i.id !== item.id) return i;
        const updated = { ...i, [field]: value } as GridItem;
        // Clear unnamed flag and lock name when user assigns a name
        if (field === 'name' && typeof value === 'string' && value.trim().length > 0) {
          updated.unnamed = false;
          updated.locked = true;
        }
        return updated;
      })
    );
    this.state.saveHistory();
  }

  /** Sanitize and update Area name + propagate to contained Locs */
  updateAreaName(value: string): void {
    const clean = value.toUpperCase().replaceAll(/[^A-Z]/g, '').slice(0, 2);
    if (!clean) return;
    const selected = this.state.selectedItems();
    if (selected.length !== 1 || selected[0].type !== 'Area') return;
    this.state.renameAreaWithLocs(selected[0].id, clean);
    this.state.saveHistory();
  }

  // ── Level helpers ──────────────────────────────────────────────────────────

  /** 'A'→1, 'B'→2, … */
  letterToLevel(letter: string): number {
    return (letter.toUpperCase().codePointAt(0) ?? Number.NaN) - 64;
  }

  getCommonLevel(): string {
    const selected = this.state.selectedItems();
    if (selected.length === 0) return 'A';
    const firstLevel = selected[0].level;
    const allSame = selected.every(i => i.level === firstLevel);
    return allSame ? String.fromCodePoint(64 + firstLevel) : '';
  }

  setCommonLevel(letter: string): void {
    const level = this.letterToLevel(letter);
    this.state.items.update(items =>
      items.map(i => i.selected ? { ...i, level } : i)
    );
    this.state.saveHistory();
  }

  readonly dupTargetLvl = signal<string>('B');

  // Intermediate models for batch Loc p-inputnumber
  batchRowVal: number | null = null;
  batchColVal: number | null = null;

  // ── Conveyor helpers ───────────────────────────────────────────────────────

  readonly conveyorDirs: ConveyorDir[] = [
    { key: 'north', label: '↑ North' },
    { key: 'south', label: '↓ South' },
    { key: 'east',  label: '→ East'  },
    { key: 'west',  label: '← West'  },
  ];

  getConnection(dir: 'north' | 'south' | 'east' | 'west'): boolean {
    const item = this.state.selectedItems()[0];
    return item?.connections?.[dir] ?? false;
  }

  // ── Batch Loc row/col edit ─────────────────────────────────────────────────

  readonly locBatchSharedRow = computed<number | null>(() => {
    const locs = this.state.selectedItems().filter(i => i.type === 'Loc');
    if (locs.length < 2) return null;
    const parsed = locs.map(i => this.state.parseLocationCode(i.name));
    if (parsed.some(p => !p)) return null;
    const row = parsed[0]!.row;
    return parsed.every(p => p!.row === row) ? row : null;
  });

  readonly locBatchSharedCol = computed<number | null>(() => {
    const locs = this.state.selectedItems().filter(i => i.type === 'Loc');
    if (locs.length < 2) return null;
    const parsed = locs.map(i => this.state.parseLocationCode(i.name));
    if (parsed.some(p => !p)) return null;
    const col = parsed[0]!.col;
    return parsed.every(p => p!.col === col) ? col : null;
  });

  applyLocBatchRow(newRow: number): void {
    this.state.items.update(items =>
      items.map(i => {
        if (!i.selected || i.type !== 'Loc') return i;
        const parsed = this.state.parseLocationCode(i.name);
        if (!parsed) return i;
        const newCode = this.state.formatLocationCode(parsed.area, parsed.col, newRow, parsed.level);
        return { ...i, id: newCode, name: newCode, locked: true };
      })
    );
    this.state.saveHistory();
  }

  applyLocBatchCol(newCol: number): void {
    this.state.items.update(items =>
      items.map(i => {
        if (!i.selected || i.type !== 'Loc') return i;
        const parsed = this.state.parseLocationCode(i.name);
        if (!parsed) return i;
        const newCode = this.state.formatLocationCode(parsed.area, newCol, parsed.row, parsed.level);
        return { ...i, id: newCode, name: newCode, locked: true };
      })
    );
    this.state.saveHistory();
  }

  // ── Loc field options ──────────────────────────────────────────────────────

  readonly bayCategories = this.state.bayCategories;
  /** value = location_profile_code */
  readonly bayTypes      = this.state.bayTypes;
  /** Zones dropdown from API */
  readonly zoneOptions   = this.state.zoneOptions;

  // ── Viewport passthrough ───────────────────────────────────────────────────

  onZoomIn():  void { this.state.zoomIn();  }
  onZoomOut(): void { this.state.zoomOut(); }
  onCenter():  void { this.state.centerViewport.update(v => v + 1); }

  clearAll(): void {
    const defaultLocs = this.state.items().filter(i => this.state.isDefaultLoc(i));
    this.state.items.set(defaultLocs);
    this.state.folders.set([]);
    this.state.saveHistory();
  }

  // ── Save panel ─────────────────────────────────────────────────────────────

  showSavePanel = false;

  toggleSavePanel(): void {
    this.showSavePanel = !this.showSavePanel;
  }
}
