import { Component, ChangeDetectionStrategy } from '@angular/core';

import { Warehouse3dCanvasComponent } from '../canvas/canvas';

@Component({
  selector: 'app-warehouse-3d-viewer',
  standalone: true,
  imports: [Warehouse3dCanvasComponent],
  templateUrl: './viewer.html',
  styleUrl: './viewer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Warehouse3dViewerComponent {}
