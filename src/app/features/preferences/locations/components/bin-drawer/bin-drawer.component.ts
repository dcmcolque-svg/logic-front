import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  Output,
  signal,
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
import { DrawerModule } from 'primeng/drawer'
import { TreeModule } from 'primeng/tree'
import { ButtonModule } from 'primeng/button'
import { ChipModule } from 'primeng/chip'
import { TooltipModule } from 'primeng/tooltip'
import { SelectModule } from 'primeng/select'
import { InputTextModule } from 'primeng/inputtext'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { ToastModule } from 'primeng/toast'
import { TreeNode, MessageService, ConfirmationService } from 'primeng/api'

import { LocationService } from '../../location.service'
import {
  Location,
  ContainerTreeNode,
  ContainerCreateInput,
  ContainerUpdateInput,
} from '../../types/location.types'
import { BinPlannerDialogComponent } from '../bin-planner-dialog/bin-planner-dialog.component'
import { PlannedBin, BinPlannerResult } from '../bin-planner-dialog/bin-planner.types'

type DrawerView = 'tree' | 'form'

@Component({
  selector: 'app-bin-drawer',
  standalone: true,
  templateUrl: './bin-drawer.component.html',
  styleUrl: './bin-drawer.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    DrawerModule,
    TreeModule,
    ButtonModule,
    ChipModule,
    TooltipModule,
    SelectModule,
    InputTextModule,
    ConfirmDialogModule,
    ToastModule,
    BinPlannerDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
})
export class BinDrawerComponent implements OnChanges {
  @Input() visible = false
  @Input() selectedLocation: Location | null = null
  @Output() visibleChange = new EventEmitter<boolean>()
  @Output() refreshData = new EventEmitter<void>()

  private readonly locationService = inject(LocationService)
  private readonly messageService = inject(MessageService)
  private readonly confirmService = inject(ConfirmationService)
  private readonly translate = inject(TranslateService)

  // State
  currentView = signal<DrawerView>('tree')
  treeData = signal<TreeNode[]>([])
  loading = signal(false)
  saving = signal(false)
  nodeCount = signal(0)
  showBinPlanner = signal(false)

  // Form state
  editingContainerId: string | null = null
  parentIdForCreate: string | null = null
  binForm!: FormGroup

  // For now bins can only be of type BIN
  containerTypes = [{ label: 'BIN', value: 'BIN' }]

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible'] && this.visible && this.selectedLocation) {
      this.currentView.set('tree')
      this.loadTree()
    }
  }

  onDrawerHide() {
    this.visible = false
    this.visibleChange.emit(false)
  }

  // === Tree loading ===
  loadTree() {
    if (!this.selectedLocation) return
    this.loading.set(true)
    this.nodeCount.set(0)

    this.locationService.getContainerTree(this.selectedLocation.id).subscribe({
      next: (nodes) => {
        this.treeData.set(this.toTreeNodes(nodes))
        this.loading.set(false)
      },
      error: () => {
        this.loading.set(false)
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('messages.error'),
          detail: 'Failed to load container tree',
        })
      },
    })
  }

  private toTreeNodes(nodes: ContainerTreeNode[]): TreeNode[] {
    return nodes.map((n) => {
      this.nodeCount.update((c) => c + 1)
      return {
        key: n.id,
        label: n.lpn_code,
        data: n,
        expanded: true,
        icon: 'pi pi-box',
        children: this.toTreeNodes(n.children || []),
      }
    })
  }

  // === CRUD actions ===
  onAddBin() {
    this.editingContainerId = null
    this.parentIdForCreate = null
    this.initForm()
    this.currentView.set('form')
  }

  onAddChildBin(node: ContainerTreeNode) {
    this.editingContainerId = null
    this.parentIdForCreate = node.id
    this.initForm()
    this.currentView.set('form')
  }

  onEditBin(node: ContainerTreeNode) {
    this.editingContainerId = node.id
    this.parentIdForCreate = null
    this.initForm(node)
    this.currentView.set('form')
  }

  onDeleteBin(node: ContainerTreeNode) {
    this.confirmService.confirm({
      message: this.translate.instant('preferences.bin.delete_message'),
      header: this.translate.instant('preferences.bin.confirm_delete'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.locationService.deleteContainer(node.id).subscribe({
          next: () => {
            this.refreshData.emit()
            this.loadTree()
          },
          error: (err) => {
            const code = err?.error?.code || ''
            if (code === 'CONTAINER_HAS_INVENTORY') {
              this.messageService.add({
                severity: 'warn',
                summary: this.translate.instant('messages.warning'),
                detail: this.translate.instant('preferences.bin.has_inventory'),
                life: 5000,
              })
            } else {
              this.messageService.add({
                severity: 'error',
                summary: this.translate.instant('messages.error'),
                detail: err?.error?.message || 'Error deleting container',
              })
            }
          },
        })
      },
    })
  }

  // === Form ===
  private initForm(existing?: ContainerTreeNode) {
    this.binForm = new FormGroup({
      lpn_code: new FormControl(existing?.lpn_code || '', [
        Validators.required,
        Validators.minLength(2),
      ]),
      type: new FormControl('BIN', [Validators.required]),
    })
  }

  onSaveBin() {
    if (!this.binForm.valid || !this.selectedLocation) return
    this.saving.set(true)
    const vals = this.binForm.value

    if (this.editingContainerId) {
      // Update
      const input: ContainerUpdateInput = { type: vals.type }
      this.locationService
        .updateContainer(this.editingContainerId, input)
        .subscribe({
          next: () => {
            this.saving.set(false)
            this.currentView.set('tree')
            this.refreshData.emit()
            this.loadTree()
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
      const input: ContainerCreateInput = {
        facility_id: this.selectedLocation.facility_id,
        location_code: this.selectedLocation.location_code,
        lpn_code: vals.lpn_code,
        type: vals.type,
        ...(this.parentIdForCreate
          ? { parent_id: this.parentIdForCreate }
          : {}),
      }
      this.locationService.createContainer(input).subscribe({
        next: () => {
          this.saving.set(false)
          this.currentView.set('tree')
          this.refreshData.emit()
          this.loadTree()
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

  onCancelForm() {
    this.currentView.set('tree')
  }

  // === Bin Planner ===
  onOpenBinPlanner() {
    this.showBinPlanner.set(true)
  }

  onBinPlannerApply(result: BinPlannerResult) {
    if (!this.selectedLocation) return

    this.showBinPlanner.set(false)
    this.loading.set(true)

    // Build batch-create payload, resolving {loc} with the actual location code
    const locationCode = this.selectedLocation.location_code
    const containers = result.bins.map(bin => ({
      lpn_code: result.nameFormat.replace('{loc}', locationCode).replace('{bin}', bin.id),
      type: bin.type || 'BIN',
      tags: bin.tag ? bin.tag.split(',').map(t => t.trim()).filter(Boolean) : [],
    }))

    this.locationService.batchCreateContainers({
      facility_id: this.selectedLocation.facility_id,
      location_code: locationCode,
      containers,
    }).subscribe({
      next: (resp) => {
        const errorCount = resp.errors?.length || 0
        const msg = errorCount > 0
          ? this.translate.instant('preferences.bin_planner.created_with_skipped', { created: resp.created, skipped: errorCount })
          : this.translate.instant('preferences.bin_planner.created_success', { created: resp.created })

        this.messageService.add({
          severity: errorCount > 0 ? 'warn' : 'success',
          summary: this.translate.instant('preferences.bin_planner.title'),
          detail: msg,
          life: 4000,
        })

        this.refreshData.emit()
        this.loadTree()
      },
      error: (err) => {
        this.loading.set(false)
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('preferences.bin_planner.title'),
          detail: err?.error?.message || this.translate.instant('preferences.bin_planner.create_failed'),
          life: 5000,
        })
      },
    })
  }

  // === Helpers ===
  isFieldInvalid(field: string): boolean {
    const ctrl = this.binForm.get(field)
    return !!(ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched))
  }
}
