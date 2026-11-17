import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface MeshTransform {
  px: number; py: number; pz: number;
  sx: number; sy: number; sz: number;
  rx: number; ry: number; rz: number;
}

export interface MeshListItem {
  id: string;
  name: string;
}

export interface ForceTransformPayload {
  axis: string;
  value: number;
  property: string;
}

export type ActionCommandType =
  | 'delete'
  | 'duplicate'
  | 'undo'
  | 'draw_start'
  | 'draw_cancel'
  | 'draw_finish';

export interface ActionCommandPayload {
  type: ActionCommandType;
}

export interface CreateSingleCommandPayload {
  name: string;
  type: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Shared state bridge between the Babylon.js canvas and the Angular UI.
 *
 * Architecture:
 *  - Signals  → reactive UI state (read by components)
 *  - Subjects → one-shot commands (Canvas ↔ UI imperative bridge)
 *
 * We intentionally avoid storing raw BABYLON.Mesh objects inside Signals
 * to prevent deep-clone issues in zoneless change detection.
 */
@Injectable({ providedIn: 'root' })
export class Warehouse3dStateService {

  // ── UI State (Canvas → UI) ─────────────────────────────────────────────────

  readonly selectedMeshId        = signal<string | null>(null);
  readonly selectedMeshName      = signal<string>('');
  readonly selectedMeshTransform = signal<MeshTransform | null>(null);
  readonly meshesList            = signal<MeshListItem[]>([]);

  // ── Commands: UI → Canvas ──────────────────────────────────────────────────

  /** Instructs the canvas to apply a transform value change on the selected mesh. */
  readonly forceTransformUpdate$ = new Subject<ForceTransformPayload>();

  /** Instructs the canvas to execute a discrete action (delete, duplicate, undo…). */
  readonly actionCommand$ = new Subject<ActionCommandPayload>();

  /** Instructs the canvas to run a generation command (payload is canvas-specific). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly generateCommand$ = new Subject<any>();

  /** Instructs the canvas to create a single named mesh of a given type. */
  readonly createSingleCommand$ = new Subject<CreateSingleCommandPayload>();

  /** Instructs the canvas to programmatically select a mesh by id. */
  readonly selectMeshCommand$ = new Subject<string>();

  // ── State Updaters (Canvas → UI) ──────────────────────────────────────────

  /**
   * Called by the canvas after a selection change to sync UI signals.
   */
  triggerUiUpdate(id: string | null, name: string, transform: MeshTransform | null): void {
    this.selectedMeshId.set(id);
    this.selectedMeshName.set(name);
    this.selectedMeshTransform.set(transform);
  }

  /**
   * Called by the canvas whenever the scene outliner list changes.
   */
  updateOutlinerList(list: MeshListItem[]): void {
    this.meshesList.set(list);
  }

  // ── Properties Panel Helpers ──────────────────────────────────────────────

  /**
   * Emits a transform update command to the canvas for the currently selected mesh.
   * No-ops when no mesh is selected.
   */
  updateTransform(
    property: 'position' | 'scaling' | 'rotation',
    axis: 'x' | 'y' | 'z',
    val: number
  ): void {
    if (!this.selectedMeshId()) return;
    this.forceTransformUpdate$.next({ property, axis, value: val });
  }

  /**
   * Updates the selected mesh name in the UI signal.
   * The canvas may subscribe to `selectMeshCommand$` or poll this signal
   * to apply the rename on the Babylon.js side.
   */
  updateName(newName: string): void {
    this.selectedMeshName.set(newName);
  }
}
