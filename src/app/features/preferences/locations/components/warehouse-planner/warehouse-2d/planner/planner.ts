import { Component, ChangeDetectionStrategy } from '@angular/core';

import { Warehouse2dViewportComponent } from '../viewport/viewport';

@Component({
  selector: 'app-warehouse-2d-planner',
  standalone: true,
  imports: [Warehouse2dViewportComponent],
  templateUrl: './planner.html',
  styleUrl: './planner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Warehouse2dPlannerComponent {}
