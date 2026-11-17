import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { DynamicDialogRef } from 'primeng/dynamicdialog'
import { WebhookScope } from './webhooks.types'

interface ScopeCard {
  scope: WebhookScope
  icon: string
  iconColor: string
  titleKey: string
  descriptionKey: string
}

@Component({
  selector: 'app-webhook-scope-chooser',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .scope-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
        padding: 0.25rem 0;
      }
      .scope-card {
        cursor: pointer;
        border-radius: 14px;
        padding: 1.75rem 1.5rem;
        border: 2px solid var(--p-surface-200);
        background: var(--p-surface-card);
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        user-select: none;
      }
      .scope-card:hover {
        border-color: var(--p-primary-color);
        transform: translateY(-3px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      }
      .scope-card .card-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.35rem;
      }
      .scope-card h4 {
        font-size: 1.05rem;
        font-weight: 600;
        margin: 0;
        color: var(--p-text-color);
      }
      .scope-card p {
        font-size: 0.8125rem;
        color: var(--p-text-muted-color);
        margin: 0;
        line-height: 1.45;
      }
    `,
  ],
  template: `
    <div class="flex flex-col gap-4">
      <p class="text-surface-500 text-sm m-0">
        {{ 'preferences.webhook.chooser_hint' | translate }}
      </p>
      <div class="scope-grid">
        @for (card of cards; track card.scope) {
          <div class="scope-card" (click)="select(card.scope)">
            <div
              class="card-icon"
              [style.background]="card.iconColor + '18'"
              [style.color]="card.iconColor"
            >
              <i [class]="card.icon"></i>
            </div>
            <h4>{{ card.titleKey | translate }}</h4>
            <p>{{ card.descriptionKey | translate }}</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class WebhookScopeChooserComponent {
  private readonly ref = inject(DynamicDialogRef)

  cards: ScopeCard[] = [
    {
      scope: 'operator',
      icon: 'pi pi-globe',
      iconColor: '#3B82F6',
      titleKey: 'preferences.webhook.scope_operator_title',
      descriptionKey: 'preferences.webhook.scope_operator_desc',
    },
    {
      scope: 'facility',
      icon: 'pi pi-building',
      iconColor: '#22C55E',
      titleKey: 'preferences.webhook.scope_facility_title',
      descriptionKey: 'preferences.webhook.scope_facility_desc',
    },
  ]

  select(scope: WebhookScope): void {
    this.ref.close(scope)
  }
}
