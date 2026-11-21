import {
  Component,
  inject,
  input,
  output,
  signal,
  OnChanges,
  SimpleChanges,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { InputTextModule } from 'primeng/inputtext'
import { MessageService } from 'primeng/api'

import { BaseDialog } from '@/app/shared/components/dialog/dialog/base-dialog.component'
import { BaseFormField } from '@/app/shared/components/form/form-field/base-form-field.component'

import {
  ContainerTreeNode,
  ContainerCreateInput,
  ContainerUpdateInput,
  Location,
} from '../../types/location.types'

import { LocationService } from '../../location.service'
import { revealInvalid } from '@/app/shared/utils/form.util'

@Component({
  selector: 'app-bin-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    InputTextModule,
    BaseDialog,
    BaseFormField,
  ],
  templateUrl: './bin-form-dialog.component.html',
})
export class BinFormDialogComponent implements OnChanges {
  private readonly locationService = inject(LocationService)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)

  // === Inputs ===
  visible = input(false)
  editing = input(false)
  container = input<ContainerTreeNode | null>(null)
  locationForDrawer = input<Location | null>(null)
  editingContainerId = input<string | null>(null)
  parentIdForCreate = input<string | null>(null)

  // === Internal state ===
  saving = signal(false)
  tagInput = '' // current text being typed in the tags input

  // === Outputs ===
  saved = output<void>()
  hide = output<void>()

  binForm!: FormGroup

  // For now bins can only be of type BIN
  typeOptions = [{ label: 'BIN', value: 'BIN' }]

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible'] && this.visible()) {
      this.initForm()
    }
  }

  private initForm() {
    const c = this.container()
    const tags = c?.tags || []

    this.binForm = new FormGroup({
      lpn_code: new FormControl(
        { value: c?.lpn_code || '', disabled: this.editing() },
        [Validators.required, Validators.minLength(2)]
      ),
      type: new FormControl('BIN', [Validators.required]),
      tags: new FormControl<string[]>(tags),
    })
    this.tagInput = ''
  }

  // === Tags management ===

  get tags(): string[] {
    return this.binForm?.get('tags')?.value || []
  }

  addTag(event?: Event) {
    event?.preventDefault()
    const value = this.tagInput.trim()
    if (!value) return
    // Split by comma to support pasting multiple tags
    const newTags = value
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    const current = [...this.tags]
    for (const tag of newTags) {
      if (!current.includes(tag)) {
        current.push(tag)
      }
    }
    this.binForm.get('tags')?.setValue(current)
    this.tagInput = ''
  }

  removeTag(index: number) {
    const current = [...this.tags]
    current.splice(index, 1)
    this.binForm.get('tags')?.setValue(current)
  }

  onTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      this.addTag()
    }
    // Allow backspace to remove last tag when input is empty
    if (event.key === 'Backspace' && !this.tagInput && this.tags.length > 0) {
      this.removeTag(this.tags.length - 1)
    }
  }

  onSave() {
    if (!this.binForm || revealInvalid(this.binForm)) return

    const loc = this.locationForDrawer()
    if (!loc) return

    // Add any remaining text in the input as a tag
    if (this.tagInput.trim()) {
      this.addTag()
    }

    const vals = {
      lpn_code: this.binForm.getRawValue().lpn_code,
      type: this.binForm.value.type,
      tags: this.tags,
    }

    this.saving.set(true)
    const containerId = this.editingContainerId()

    if (containerId) {
      // Update
      const updateInput: ContainerUpdateInput = {
        type: vals.type,
        tags: vals.tags,
      }
      this.locationService.updateContainer(containerId, updateInput).subscribe({
        next: () => {
          this.saving.set(false)
          this.saved.emit()
        },
        error: (err) => {
          this.saving.set(false)
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('messages.error'),
            detail: err?.error?.message || 'Error updating container',
          })
        },
      })
    } else {
      // Create
      const parentId = this.parentIdForCreate()
      const createInput: ContainerCreateInput = {
        facility_id: loc.facility_id,
        location_code: loc.location_code,
        lpn_code: vals.lpn_code,
        type: vals.type,
        tags: vals.tags,
        ...(parentId ? { parent_id: parentId } : {}),
      }
      this.locationService.createContainer(createInput).subscribe({
        next: () => {
          this.saving.set(false)
          this.saved.emit()
        },
        error: (err) => {
          this.saving.set(false)
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('messages.error'),
            detail: err?.error?.message || 'Error creating container',
          })
        },
      })
    }
  }
}
