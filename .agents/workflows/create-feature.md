---
description: How to create a new feature module in the Angular project
---

// turbo-all

# Create New Feature

Follow these steps to scaffold a new feature module:

## 1. Create the feature directory structure

```bash
mkdir -p src/app/features/<feature-name>/{components,services,types}
```

## 2. Create the feature types

Create `src/app/features/<feature-name>/types/<feature-name>.types.ts` with the interfaces/types for this feature.

## 3. Create the feature service

Create `src/app/features/<feature-name>/services/<feature-name>.service.ts`:

```typescript
import { inject, Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class <FeatureName>Service {
  private readonly http = inject(HttpClient);
  private readonly url = environment.URL_API;

  // Add reactive state with signals
  // Add HTTP methods
}
```

## 4. Create the main component

Create `src/app/features/<feature-name>/components/<feature-name>/<feature-name>.component.ts`:

```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-<feature-name>',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './<feature-name>.component.html',
  styleUrls: ['./<feature-name>.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class <FeatureName>Component {
  // Use inject() for dependencies
}
```

## 5. Create the feature routes

Create `src/app/features/<feature-name>/<feature-name>.routes.ts`:

```typescript
import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./components/<feature-name>/<feature-name>.component')
      .then(c => c.<FeatureName>Component)
  }
] as Routes;
```

## 6. Register the feature in app.routes.ts

Add the lazy-loaded route inside the `path: 'app'` children:

```typescript
{
  path: '<feature-name>',
  data: { breadcrumb: '<Feature Name>' },
  loadChildren: () => import('./app/features/<feature-name>/<feature-name>.routes')
}
```

## 7. Add menu entry (optional)

Update `src/app/layout/components/app.menu.ts` to add a menu item for the new feature.

## 8. Verify build

```bash
ng build --configuration=development
```
