---
name: Angular 21 Best Practices
description: Best practices, patterns, and conventions for Angular 21 standalone applications with PrimeNG and Signals
---

# Angular 21 Best Practices

## Architecture: Feature-Based Modular

```
src/app/
├── core/           # Singletons: guards, interceptors, services, types
├── shared/         # Reusable: components, pipes, directives, utils
├── layout/         # App shell: sidebar, topbar, footer, configurator
└── features/       # Business domains (lazy-loaded)
    └── <feature>/
        ├── components/
        ├── services/
        ├── types/
        └── <feature>.routes.ts
```

### Dependency Rules
- `features/ → shared/ → core/` (NEVER the reverse)
- Features NEVER import from other features
- `core/` = singletons only, injected via `inject()`
- `shared/` = reusable, imported by any feature

---

## Component Patterns

### Always Use Standalone Components
```typescript
@Component({
  selector: 'app-example',
  standalone: true,
  imports: [CommonModule, RouterModule],  // only what's needed
  templateUrl: './example.component.html',
  styleUrls: ['./example.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush  // ALWAYS use OnPush
})
export class ExampleComponent {
  private readonly service = inject(ExampleService);  // use inject(), NOT constructor
}
```

### NEVER Do
- ❌ `NgModule` for anything
- ❌ Constructor injection (`constructor(private service: Service)`)
- ❌ `ChangeDetectionStrategy.Default`
- ❌ Class-based guards or interceptors
- ❌ `HttpClientModule` — use `provideHttpClient()`
- ❌ Zone.js — project uses `provideZonelessChangeDetection()`

---

## State Management: Signals

### Service with State
```typescript
@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly http = inject(HttpClient);

  // Private writable signal
  private _items = signal<Item[]>([]);
  
  // Public readonly
  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().length);
  readonly loading = signal(false);

  loadItems() {
    this.loading.set(true);
    this.http.get<Item[]>('/api/items').subscribe({
      next: (data) => {
        this._items.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
}
```

### In Templates
```html
<!-- Use signal values directly in template -->
@if (service.loading()) {
  <p-progressSpinner />
}

@for (item of service.items(); track item.id) {
  <app-item-card [item]="item" />
}
```

---

## Routing

### Lazy Loading per Feature
```typescript
// app.routes.ts
{
  path: 'feature',
  loadChildren: () => import('./app/features/feature/feature.routes'),
  canActivate: [authGuard]
}
```

### Feature Routes File
```typescript
// feature.routes.ts
import { Routes } from '@angular/router';

export default [
  { path: '', component: FeatureListComponent },
  { path: ':id', component: FeatureDetailComponent },
  { path: 'create', component: FeatureFormComponent }
] as Routes;
```

---

## Guards & Interceptors (Functional Only)

### Guard
```typescript
export const authGuard = async () => {
  const authService = inject(AuthService);
  if (authService.isAuthenticated()) return true;
  authService.redirectTologin();
  return false;
};
```

### Interceptor
```typescript
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req.clone({ withCredentials: true }));
};
```

### Registration in app.config.ts
```typescript
provideHttpClient(
  withFetch(),
  withInterceptors([apiInterceptor, errorInterceptor])
)
```

---

## Template Syntax (Angular 21)

### Control Flow (use built-in, NOT *ngIf/*ngFor)
```html
<!-- Conditionals -->
@if (condition) {
  <div>Content</div>
} @else {
  <div>Fallback</div>
}

<!-- Loops -->
@for (item of items(); track item.id) {
  <div>{{ item.name }}</div>
} @empty {
  <div>No items</div>
}

<!-- Switch -->
@switch (status) {
  @case ('active') { <span>Active</span> }
  @case ('inactive') { <span>Inactive</span> }
  @default { <span>Unknown</span> }
}
```

### NEVER use deprecated directives
- ❌ `*ngIf` — use `@if`
- ❌ `*ngFor` — use `@for` with `track`
- ❌ `*ngSwitch` — use `@switch`

---

## Services

### HTTP Calls
```typescript
@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.URL_API;

  getAll() {
    return this.http.get<Item[]>(`${this.url}eng/v1/items`);
  }

  create(item: CreateItemDto) {
    return this.http.post<Item>(`${this.url}eng/v1/items`, item);
  }

  update(item: UpdateItemDto) {
    return this.http.put<Item>(`${this.url}eng/v1/items/${item.id}`, item);
  }

  delete(id: number) {
    return this.http.delete(`${this.url}eng/v1/items/${id}`);
  }
}
```

---

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Components | `kebab-case.component.ts` | `receiving-list.component.ts` |
| Services | `kebab-case.service.ts` | `inbound.service.ts` |
| Types | `kebab-case.types.ts` | `inbound.types.ts` |
| DTOs | `kebab-case.dto.ts` | `inbound.dto.ts` |
| Guards | `kebab-case.guard.ts` | `auth.guard.ts` |
| Interceptors | `kebab-case.interceptor.ts` | `api.interceptor.ts` |
| Routes | `feature.routes.ts` | `inbound.routes.ts` |

### Types Rules
- Use `interface` instead of `class` for data shapes
- Use `types/` folder, NOT `models/`
- NO `Model` suffix — `AuthResponse` not `AuthResponseModel`
- Use `.types.ts` for domain interfaces, `.dto.ts` for API request/response shapes

---

## PrimeNG Integration

- Import PrimeNG components individually in each component's `imports` array
- Use `providePrimeNG()` in `app.config.ts` for global theme config
- Use `MessageService` for toasts via `MessageEdgeService` wrapper
- Prefer PrimeNG component selectors (e.g., `p-button`, `p-table`, `p-dialog`)

---

## Environments

This project has 7 environments configured in `angular.json`:
- `development` (localhost:8082)
- `production` (apibl7.binlogic.io)
- `edge01` through `edge04` (edgeXX.shipedge.com)
- `bl8` (apibl8.binlogic.io)

To serve/build with a specific environment:
```bash
ng serve --configuration=edge01
ng build --configuration=bl8
```
