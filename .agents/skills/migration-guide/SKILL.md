---
name: Edge-Frontend Migration Guide
description: Rules and patterns for migrating components from edge-frontend (Angular 18 NgModule) to binlogic (Angular 21 Standalone)
---

# Migration Guide: edge-frontend → binlogic

## Path Mapping

| edge-frontend (old) | binlogic (new) |
|---------------------|----------------|
| `core/_services/<domain>/` | **Co-located**: `features/<feature>/<domain>/<domain>.service.ts` |
| `core/_models/<domain>/` | **Co-located**: `features/<feature>/<domain>/<domain>.types.ts` |
| `core/components/pages/<domain>/` | `features/<feature>/<domain>/<domain>.component.ts` |
| `core/_services/common/` (shared) | `core/services/` |
| `core/_models/` (shared) | `core/types/` |
| `core/interceptores/` | `core/interceptors/` |
| `core/_utils/guards/` | `core/guards/` |
| `core/config/` | `shared/config/` or `core/config/` |
| `core/pipes/` | `shared/pipes/` |
| `src/environments/` | `src/environments/` (same) |

---

## Conversion Rules

### 1. NgModule → Standalone

**Before (edge-frontend):**
```typescript
@NgModule({
  declarations: [MyComponent],
  imports: [CommonModule, FormsModule],
  exports: [MyComponent]
})
export class MyModule {}
```

**After (binlogic):**
```typescript
@Component({
  selector: 'app-my',
  standalone: true,
  imports: [CommonModule, FormsModule],  // imports go directly on component
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyComponent {}
```

- Delete ALL `.module.ts` files
- Delete ALL `-routing.module.ts` files — replace with `.routes.ts`
- Move `imports` from module to each component that needs them

---

### 2. Template Syntax

| Old (edge-frontend) | New (binlogic) |
|---------------------|----------------|
| `*ngIf="condition"` | `@if (condition) { }` |
| `*ngIf="x; else tmpl"` | `@if (x) { } @else { }` |
| `*ngFor="let item of items"` | `@for (item of items; track item.id) { }` |
| `*ngFor + empty` | `@for (...) { } @empty { }` |
| `[ngSwitch]` + `*ngSwitchCase` | `@switch (x) { @case ('a') { } }` |

**CRITICAL:** `@for` ALWAYS requires `track`. Use `track item.id` or `track $index`.

---

### 3. Dependency Injection

| Old | New |
|-----|-----|
| `constructor(private service: MyService)` | `private service = inject(MyService);` |
| `constructor(@Inject(TOKEN) val)` | `private val = inject(TOKEN);` |

---

### 4. Interceptors: Class → Functional

**Before:**
```typescript
@Injectable()
export class MyInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}
  intercept(req, next) { ... }
}
// Registered as: { provide: HTTP_INTERCEPTORS, useClass: MyInterceptor, multi: true }
```

**After:**
```typescript
export const myInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  // ...
  return next(req);
};
// Registered as: provideHttpClient(withInterceptors([myInterceptor]))
```

---

### 5. Guards: Class → Functional

**Before:**
```typescript
@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  canActivate() { ... }
}
```

**After:**
```typescript
export const authGuard = async () => {
  const authService = inject(AuthService);
  return authService.isAuthenticated();
};
```

---

### 6. Routing Modules → Route Files

**Before (edge-frontend):**
```typescript
@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FeatureRoutingModule {}
```

**After (binlogic):**
```typescript
// feature.routes.ts
import { Routes } from '@angular/router';
export default [
  { path: '', component: FeatureListComponent },
  { path: ':id', component: FeatureDetailComponent }
] as Routes;
```

---

### 7. Types Naming Convention

| Old (edge-frontend) | New (binlogic) |
|---------------------|----------------|
| `*.model.ts` | `*.types.ts` |
| `export class FooModel` | `export interface Foo` |
| `export class AuthResponseModel` | `export interface AuthResponse` |
| `_models/` folder | `types/` folder |

- Use `interface` instead of `class` for data shapes (no methods)
- Remove `Model` suffix from all type names
- Use `.dto.ts` suffix for API request/response shapes only

---

### 8. Services

Keep the same logic but adapt:
- `inject()` instead of constructor injection
- `environment` import path: `import { environment } from '../../../../environments/environment'`  
  (or use relative path from the service's location)
- Signals for reactive state instead of BehaviorSubject
- Remove any `providedIn: 'root'` services from NgModule `providers` arrays

---

### 9. PrimeNG Component Updates

Some PrimeNG components may have different APIs in v21 vs v17/v18.
Always check [PrimeNG v21 docs](https://primeng.org/) when migrating.

Common changes:
- `p-table` → might need updated column template syntax
- Dialog/Modal APIs may differ
- Theme system uses `@primeuix/themes` now

## File Organization: Co-location Pattern

Services and types that belong to a specific component should be **co-located** in the same folder as the component. Only global/shared services and types go in `core/` or `shared/`.

### Feature Component (co-located)

```
features/<feature-area>/<component-name>/
├── <component-name>.component.ts      ← Main component (default export for lazy loading)
├── <component-name>.service.ts        ← HTTP service specific to this component
├── <component-name>.types.ts          ← Types/interfaces specific to this component
└── <component-name>-form.component.ts ← Sub-components (forms, dialogs, etc.)
```

**Example:**
```
features/preferences/
├── api-key/
│   ├── api-key.component.ts
│   ├── api-key.service.ts
│   ├── api-key.types.ts
│   └── api-key-form.component.ts
└── preferences.routes.ts
```

### Global/Shared (separate folders)

Only use these for services and types used across **multiple features**:

```
core/services/       ← Global services (auth, translate, etc.)
core/types/          ← Global types (auth.types.ts, etc.)
shared/pipes/        ← Reusable pipes
shared/components/   ← Reusable UI components
```

---

## Migration Checklist per Feature

When migrating a feature from edge-frontend:

1. [ ] Create `features/<feature-area>/<component-name>/` directory
2. [ ] Copy and convert types to `<component-name>.types.ts` (co-located)
   - `class` → `interface`
   - Remove `Model` suffix
3. [ ] Copy and adapt service to `<component-name>.service.ts` (co-located)
   - Constructor → `inject()`
   - Environment import path
   - Signals for state
4. [ ] Copy and convert component to `<component-name>.component.ts`
   - Add `standalone: true`, `changeDetection: OnPush`
   - Use `default export` for lazy loading
   - Move module imports to component imports
   - Convert templates (`*ngIf` → `@if`, etc.)
   - Constructor → `inject()`
   - Inline template (no separate `.html`)
5. [ ] Create `<feature-area>.routes.ts` (replace routing module)
6. [ ] Register in `app.routes.ts` as lazy-loaded child
7. [ ] Add menu entry in `app.menu.config.ts`
8. [ ] Add translation keys to `en.json` and `es.json`
9. [ ] Verify build: `ng build --configuration=development`
