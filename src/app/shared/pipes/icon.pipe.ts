import { Pipe, PipeTransform } from '@angular/core'
import { iconClass, FALLBACK_ICON } from '../config/icon.registry'

/**
 * Resolves a semantic key (field key, status, event type) to a full PrimeIcon
 * class via the shared icon registry.
 *
 * ```html
 * <i [class]="field.key | icon"></i>            <!-- 'pi pi-tag' -->
 * <i [class]="order.status | icon:'pi-flag'"></i>
 * ```
 */
@Pipe({
  name: 'icon',
  standalone: true,
})
export class IconPipe implements PipeTransform {
  transform(value: string | null | undefined, fallback = FALLBACK_ICON): string {
    return iconClass(value ?? '', fallback)
  }
}
