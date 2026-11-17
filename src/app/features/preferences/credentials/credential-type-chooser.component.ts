import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { DynamicDialogRef } from 'primeng/dynamicdialog'

export type CredentialKind = 'operator-key' | 'facility-key' | 'oauth2'

interface TypeCard {
  kind: CredentialKind
  icon: string
  iconColor: string
  borderColor: string
  titleKey: string
  descriptionKey: string
}

@Component({
  selector: 'app-credential-type-chooser',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .type-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
      }
      .type-card {
        cursor: pointer;
        border-radius: 12px;
        padding: 1.5rem;
        border: 1px solid var(--p-surface-200);
        background: var(--p-surface-card);
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .type-card:hover {
        border-color: var(--p-primary-color);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
      .type-card .card-icon {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
      }
      .type-card h4 {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        color: var(--p-text-color);
      }
      .type-card p {
        font-size: 0.8125rem;
        color: var(--p-text-muted-color);
        margin: 0;
        line-height: 1.4;
      }
    `,
  ],
  template: `
    <div class="flex flex-col gap-4">
      <p class="text-surface-500 text-sm m-0">
        {{ 'labels.choose_credential_type' | translate }}
      </p>
      <div class="type-grid">
        @for (card of cards; track card.kind) {
          <div class="type-card" (click)="select(card.kind)">
            <div
              class="card-icon"
              [style.background]="card.iconColor + '15'"
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
export class CredentialTypeChooserComponent {
  private readonly ref = inject(DynamicDialogRef)

  cards: TypeCard[] = [
    {
      kind: 'operator-key',
      icon: 'pi pi-key',
      iconColor: '#3B82F6',
      borderColor: '#3B82F6',
      titleKey: 'credential_types.operator_key.title',
      descriptionKey: 'credential_types.operator_key.description',
    },
    {
      kind: 'facility-key',
      icon: 'pi pi-building',
      iconColor: '#22C55E',
      borderColor: '#22C55E',
      titleKey: 'credential_types.facility_key.title',
      descriptionKey: 'credential_types.facility_key.description',
    },
  ]

  select(kind: CredentialKind): void {
    this.ref.close(kind)
  }
}
