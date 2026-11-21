import { CanDeactivateFn } from '@angular/router'

/**
 * A page holding work the user has not saved yet. `canLeave` answers whether
 * navigating away is fine — typically by asking the user when there are
 * unsaved changes.
 */
export interface CanLeave {
  canLeave(): boolean | Promise<boolean>
}

/**
 * Route guard: asks the page before leaving it. Add to a route with
 * `canDeactivate: [unsavedChangesGuard]` and implement `CanLeave` on its component.
 * Closing or reloading the tab is covered by the page's own `beforeunload`.
 */
export const unsavedChangesGuard: CanDeactivateFn<CanLeave> = (component) =>
  component?.canLeave ? component.canLeave() : true
