---
name: API & State Patterns
description: Standard patterns for CRUD services, state management with Signals, loading/error states, and server-side pagination
---

# API & State Patterns

## CRUD Service with Signals

Standard pattern for any feature service that does CRUD operations with reactive state.

```typescript
import { inject, Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.URL_API;

  // === Reactive State ===
  private _items = signal<Item[]>([]);
  private _loading = signal(false);
  private _error = signal<string | null>(null);

  // Public readonly signals
  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly count = computed(() => this._items().length);
  readonly hasItems = computed(() => this._items().length > 0);

  // === CRUD Operations ===

  loadAll() {
    this._loading.set(true);
    this._error.set(null);
    this.http.get<Item[]>(`${this.url}eng/v1/items`).subscribe({
      next: (data) => {
        this._items.set(data);
        this._loading.set(false);
      },
      error: (err) => {
        this._error.set(err.message || 'Error loading items');
        this._loading.set(false);
      }
    });
  }

  create(dto: CreateItemDto) {
    return this.http.post<Item>(`${this.url}eng/v1/items`, dto);
  }

  update(dto: UpdateItemDto) {
    return this.http.put<Item>(`${this.url}eng/v1/items/${dto.id}`, dto);
  }

  delete(id: number) {
    return this.http.delete(`${this.url}eng/v1/items/${id}`);
  }
}
```

---

## Server-Side Pagination & Filtering

For paginated lists (used heavily across edge-frontend).

### Types
```typescript
// feature.types.ts
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  current_page: number;
  page_size: number;
}

export interface FilterDto {
  current_page: number;
  page_size: number;
  sort_field?: string;
  sort_order?: number;  // 1 = asc, -1 = desc
  filters?: Record<string, any>;
}
```

### Service
```typescript
@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.URL_API;

  // State
  private _items = signal<Item[]>([]);
  private _totalRecords = signal(0);
  private _loading = signal(false);

  readonly items = this._items.asReadonly();
  readonly totalRecords = this._totalRecords.asReadonly();
  readonly loading = this._loading.asReadonly();

  loadFiltered(filter: FilterDto) {
    this._loading.set(true);
    this.http.post<PaginatedResponse<Item>>(
      `${this.url}eng/v1/items/list`, filter
    ).subscribe({
      next: (resp) => {
        this._items.set(resp.data);
        this._totalRecords.set(resp.total);
        this._loading.set(false);
      },
      error: () => this._loading.set(false)
    });
  }
}
```

### Component with p-table
```typescript
@Component({
  selector: 'app-item-list',
  standalone: true,
  imports: [TableModule, CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-table
      [value]="service.items()"
      [totalRecords]="service.totalRecords()"
      [loading]="service.loading()"
      [lazy]="true"
      [paginator]="true"
      [rows]="20"
      (onLazyLoad)="onLazyLoad($event)"
    >
      <ng-template pTemplate="header">
        <tr>
          <th pSortableColumn="name">Name <p-sortIcon field="name" /></th>
          <th>Actions</th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-item>
        <tr>
          <td>{{ item.name }}</td>
          <td>
            <p-button icon="pi pi-pencil" (onClick)="edit(item)" />
          </td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr><td colspan="2">No items found</td></tr>
      </ng-template>
    </p-table>
  `
})
export class ItemListComponent implements OnInit {
  readonly service = inject(FeatureService);

  ngOnInit() {
    this.service.loadFiltered({ current_page: 1, page_size: 20 });
  }

  onLazyLoad(event: any) {
    this.service.loadFiltered({
      current_page: Math.floor(event.first / event.rows) + 1,
      page_size: event.rows,
      sort_field: event.sortField,
      sort_order: event.sortOrder
    });
  }

  edit(item: Item) {
    // open dialog or navigate
  }
}
```

---

## CRUD Dialog Pattern

For create/edit operations using PrimeNG Dialog.

```typescript
@Component({
  selector: 'app-item-form-dialog',
  standalone: true,
  imports: [DialogModule, InputTextModule, ButtonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="isEdit() ? 'Edit Item' : 'Create Item'"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '450px' }"
    >
      <form [formGroup]="form">
        <div class="field">
          <label for="name">Name</label>
          <input pInputText id="name" formControlName="name" class="w-full" />
        </div>
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" (onClick)="close()" />
        <p-button label="Save" (onClick)="save()" [loading]="saving()" />
      </ng-template>
    </p-dialog>
  `
})
export class ItemFormDialogComponent {
  private readonly service = inject(FeatureService);
  private readonly messageService = inject(MessageEdgeService);
  private readonly fb = inject(FormBuilder);

  visible = false;
  saving = signal(false);
  isEdit = signal(false);
  private editId: number | null = null;

  form = this.fb.group({
    name: ['', Validators.required]
  });

  open(item?: Item) {
    this.isEdit.set(!!item);
    this.editId = item?.id ?? null;
    if (item) {
      this.form.patchValue({ name: item.name });
    } else {
      this.form.reset();
    }
    this.visible = true;
  }

  save() {
    if (!this.form.valid) return;
    this.saving.set(true);
    const value = this.form.getRawValue();

    const request$ = this.isEdit()
      ? this.service.update({ id: this.editId!, ...value })
      : this.service.create(value);

    request$.subscribe({
      next: () => {
        this.messageService.showSuccess(this.isEdit() ? 'Updated' : 'Created');
        this.saving.set(false);
        this.close();
        this.service.loadAll();  // refresh list
      },
      error: () => this.saving.set(false)
    });
  }

  close() {
    this.visible = false;
  }
}
```

---

## Loading & Error States in Templates

```html
@if (service.loading()) {
  <div class="flex justify-center p-6">
    <p-progressSpinner strokeWidth="4" />
  </div>
} @else if (service.error()) {
  <p-message severity="error" [text]="service.error()!" />
} @else {
  @if (service.hasItems()) {
    <!-- render data -->
  } @else {
    <p-message severity="info" text="No data available" />
  }
}
```

---

## Key Rules

1. **Services own the state** — components read signals, never hold their own data copies
2. **Use `asReadonly()`** — expose read-only signals to components
3. **Loading/error per operation** — every async operation should track its loading/error state
4. **Subscribe in services for state updates** — return Observable for one-off operations (create, update, delete)
5. **Use `inject()` ONLY** — never constructor injection
6. **API base from environment** — always `environment.URL_API`, never hardcoded URLs
