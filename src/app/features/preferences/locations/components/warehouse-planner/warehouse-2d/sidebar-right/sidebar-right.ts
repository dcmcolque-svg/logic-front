import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';

import {
  Warehouse2dStateService,
  GridItem,
} from '../../services/warehouse-2d-state.service';

// ─── Local Types ──────────────────────────────────────────────────────────────

interface RightTab {
  id: string;
  label: string;
}

interface ConveyorDir {
  key: 'north' | 'south' | 'east' | 'west';
  label: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-sidebar-right-2d',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    TooltipModule,
  ],
  templateUrl: './sidebar-right.html',
  styleUrl: './sidebar-right.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarRight2dComponent {

  readonly state = inject(Warehouse2dStateService);

  // ── Tabs ───────────────────────────────────────────────────────────────────

  readonly tabs: RightTab[] = [
    { id: 'generate', label: 'Generate' },
    { id: 'list',     label: 'List'     },
  ];

  switchTab(id: string): void {
    this.tabs.forEach(t => {
      if (this.state.isPanelOpen(t.id) && t.id !== id) {
        this.state.togglePanel(t.id);
      }
    });
    if (!this.state.isPanelOpen(id)) {
      this.state.openPanel(id);
    }
  }

  // ── Generate form state ────────────────────────────────────────────────────

  genArea        = '';
  genZone        = '';
  genOrientation = 'horizontal';
  genRInit       = 1;
  genREnd        = 10;
  genBInit       = 1;
  genBEnd        = 10;
  genLevelStart  = 'a';
  genLevelEnd    = 'a';
  genCategory    = 'REGULAR';
  genType        = 'F'; // location_profile_code
  genColDir: 'ltr' | 'rtl' = 'ltr';
  genRowDir: 'ttb' | 'btt' = 'ttb';

  readonly bayCategories = this.state.bayCategories;
  /** value = location_profile_code */
  readonly bayTypes      = this.state.bayTypes;

  /** Zones dropdown: [{label, value}] — from API */
  readonly zoneOptions = this.state.zoneOptions;

  sanitizeArea(value: string): string {
    return value.toUpperCase().replaceAll(/[^A-Z]/g, '').slice(0, 2);
  }

  onGenAreaChange(areaCode: string): void {
    const maxes = this.state.getAreaMaxColRow(areaCode);
    if (!maxes) return;

    const colCount = Math.max(1, (this.genBEnd - this.genBInit) + 1);
    const rowCount = Math.max(1, (this.genREnd - this.genRInit) + 1);

    this.genBInit = maxes.maxCol + 1;
    this.genBEnd  = this.genBInit + colCount - 1;
    this.genRInit = maxes.maxRow + 1;
    this.genREnd  = this.genRInit + rowCount - 1;
  }

  onGenerate(event: SubmitEvent): void {
    event.preventDefault();
    // TODO: wire to canvas generate command
  }

  /** Level letters for the generate form (a→j) */
  readonly levelLetterOptions = [
    'a','b','c','d','e','f','g','h','i','j',
  ].map(l => ({ label: l.toUpperCase(), value: l }));

  /** Orientation options */
  readonly orientationOptions = [
    { label: 'Horizontal (Rows across, locs down)', value: 'horizontal' },
    { label: 'Vertical (Rows down, locs across)',   value: 'vertical'   },
  ];

  // ── List (Outliner) helpers ────────────────────────────────────────────────

  selectedFolderId = '';

  /** Folder dropdown: [{label, value}] */
  readonly folderOptions = computed(() => [
    { label: 'Select Folder...', value: '' },
    ...this.state.folders().map(f => ({ label: f.name, value: f.id })),
  ]);

  getFolderItems(folderId: string): GridItem[] {
    const folder = this.state.folders().find(f => f.id === folderId);
    if (!folder) return [];
    return folder.itemIds
      .map(id => this.state.items().find(i => i.id === id))
      .filter((i): i is GridItem => !!i);
  }

  getUnassignedItems(): GridItem[] {
    const assigned = new Set(this.state.folders().flatMap(f => f.itemIds));
    return this.state.items().filter(i => !assigned.has(i.id));
  }

  addToFolder(): void {
    if (!this.selectedFolderId) return;
    const ids = this.state.selectedItems().map(i => i.id);
    this.state.assignItemsToFolder(this.selectedFolderId, ids);
  }

  renameFolder(folderId: string, event: FocusEvent): void {
    const el = event.target as HTMLElement;
    this.state.renameFolderItem(folderId, el.innerText.trim());
  }

  renameBayCode(itemId: string, event: FocusEvent): void {
    const el   = event.target as HTMLElement;
    const name = el.innerText.trim();
    this.state.items.update(items =>
      items.map(i => i.id === itemId ? { ...i, name, id: name, locked: true } : i)
    );
    this.state.saveHistory();
  }

  onListItemClick(event: MouseEvent | KeyboardEvent, itemId: string): void {
    if (!event.shiftKey) this.state.clearSelection();
    this.state.items.update(items =>
      items.map(i => i.id === itemId ? { ...i, selected: true } : i)
    );
  }

  blurTarget(event: Event): void {
    (event.target as HTMLElement).blur();
  }
}
