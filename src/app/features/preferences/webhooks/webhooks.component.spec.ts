import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ConfirmationService, MessageService } from 'primeng/api'
import { DialogService } from 'primeng/dynamicdialog'
import { signal } from '@angular/core'

import WebhooksComponent from './webhooks.component'
import { WebhookService } from './webhooks.service'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { FilterApplyService } from '../../../shared/components/filter-clear/filter-apply.service'
import { TableStateService } from '../../../shared/services/table-state.service'
import { TranslateLanService } from '../../../core/services/translate-lan.service'

describe('WebhooksComponent – filter MatchModel', () => {
  let component: WebhooksComponent
  let fixture: ComponentFixture<WebhooksComponent>
  let tableStateSpy: jasmine.SpyObj<TableStateService>

  beforeEach(async () => {
    const webhookServiceStub = {
      postListFilterWebhooks: jasmine.createSpy().and.returnValue({ subscribe: () => {} }),
    }
    const facilityScopeStub = {
      inScope: signal([]),
      selectedIds: signal([]),
      isSingle: signal(false),
      isSingleWithoutNulls: signal(false),
      all: signal([]),
      loaded: signal(true),
      loading: signal(false),
      scopeIds: signal(null),
      apiValue: signal(null),
      includesNoFacility: signal(true),
    }
    const filterApplyStub = {
      applied$: { subscribe: () => ({ unsubscribe: () => {} }) },
    }
    tableStateSpy = jasmine.createSpyObj('TableStateService', ['load', 'save', 'clear'])
    tableStateSpy.load.and.returnValue(null)

    const translateLanStub = {
      changeLanguage: signal('en'),
    }

    await TestBed.configureTestingModule({
      imports: [WebhooksComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DialogService,
        ConfirmationService,
        MessageService,
        { provide: WebhookService, useValue: webhookServiceStub },
        { provide: FacilityScopeService, useValue: facilityScopeStub },
        { provide: FilterApplyService, useValue: filterApplyStub },
        { provide: TableStateService, useValue: tableStateSpy },
        { provide: TranslateLanService, useValue: translateLanStub },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(WebhooksComponent)
    component = fixture.componentInstance
    // Don't call detectChanges to avoid the full effect/init chain;
    // we only test the filter logic methods.
  })

  // ── applyWebhookFilters ──────────────────────────────────────────────

  describe('applyWebhookFilters', () => {
    it('should wrap status in a MatchModel with match_mode "equals"', () => {
      component.filterStatus = 'INACTIVE'
      component.applyWebhookFilters()

      const dto = component.webhookFilterDto()
      expect(dto.filter['status']).toEqual({
        value: 'INACTIVE',
        match_mode: 'equals',
      })
    })

    it('should wrap status ACTIVE in a MatchModel', () => {
      component.filterStatus = 'ACTIVE'
      component.applyWebhookFilters()

      const dto = component.webhookFilterDto()
      expect(dto.filter['status']).toEqual({
        value: 'ACTIVE',
        match_mode: 'equals',
      })
    })

    it('should NOT include status when filterStatus is null', () => {
      component.filterStatus = null
      component.applyWebhookFilters()

      const dto = component.webhookFilterDto()
      expect(dto.filter['status']).toBeUndefined()
    })

    it('should send scope as a plain string (not a MatchModel)', () => {
      component.filterScope = 'operator'
      component.applyWebhookFilters()

      const dto = component.webhookFilterDto()
      // scope is a plain string in the backend Go struct, so no MatchModel
      expect(dto.filter['scope']).toBe('operator')
    })

    it('should send endpoint_url as a MatchModel with match_mode "contains"', () => {
      component.filterEndpointUrl = 'https://example.com'
      component.applyWebhookFilters()

      const dto = component.webhookFilterDto()
      expect(dto.filter['endpoint_url']).toEqual({
        value: 'https://example.com',
        match_mode: 'contains',
      })
    })

    it('should send facility_id as a MatchModel with match_mode "in"', () => {
      component.filterFacilityIds = ['f1', 'f2']
      component.applyWebhookFilters()

      const dto = component.webhookFilterDto()
      expect(dto.filter['facility_id']).toEqual({
        value: ['f1', 'f2'],
        match_mode: 'in',
      })
    })

    it('should reset page to 1 when filters are applied', () => {
      component.webhookFilterDto.update(d => ({
        ...d,
        config: { ...d.config, page: 5 },
      }))
      component.filterStatus = 'ACTIVE'
      component.applyWebhookFilters()

      expect(component.webhookFilterDto().config.page).toBe(1)
    })

    it('should combine multiple filters correctly', () => {
      component.filterStatus = 'INACTIVE'
      component.filterScope = 'facility'
      component.filterEndpointUrl = 'hook.io'
      component.applyWebhookFilters()

      const dto = component.webhookFilterDto()
      expect(dto.filter['status']).toEqual({ value: 'INACTIVE', match_mode: 'equals' })
      expect(dto.filter['scope']).toBe('facility')
      expect(dto.filter['endpoint_url']).toEqual({ value: 'hook.io', match_mode: 'contains' })
    })
  })

  // ── webhookFilterChips ───────────────────────────────────────────────

  describe('webhookFilterChips', () => {
    it('should display status chip reading value from MatchModel', () => {
      component.filterStatus = 'INACTIVE'
      component.applyWebhookFilters()

      const chips = component.webhookFilterChips
      const statusChip = chips.find(c => c.field === 'status')
      expect(statusChip).toBeDefined()
      expect(statusChip!.displayValue).toBeTruthy()
    })

    it('should not have a status chip when status filter is null', () => {
      component.filterStatus = null
      component.applyWebhookFilters()

      const chips = component.webhookFilterChips
      const statusChip = chips.find(c => c.field === 'status')
      expect(statusChip).toBeUndefined()
    })

    it('should handle legacy string format for status in chips gracefully', () => {
      // Simulate a legacy manualFilters state where status was a plain string
      ;(component as any).manualFilters = { status: 'ACTIVE' }

      const chips = component.webhookFilterChips
      const statusChip = chips.find(c => c.field === 'status')
      expect(statusChip).toBeDefined()
      // Should fall back to the string itself
      expect(statusChip!.displayValue).toBeTruthy()
    })
  })

  // ── removeWebhookFilterChip ──────────────────────────────────────────

  describe('removeWebhookFilterChip', () => {
    it('should remove the status filter and clear filterStatus', () => {
      component.filterStatus = 'INACTIVE'
      component.applyWebhookFilters()

      component.removeWebhookFilterChip('status')

      expect(component.filterStatus).toBeNull()
      expect(component.webhookFilterDto().filter['status']).toBeUndefined()
    })

    it('should preserve other filters when removing status', () => {
      component.filterStatus = 'ACTIVE'
      component.filterEndpointUrl = 'hook.io'
      component.applyWebhookFilters()

      component.removeWebhookFilterChip('status')

      const dto = component.webhookFilterDto()
      expect(dto.filter['status']).toBeUndefined()
      expect(dto.filter['endpoint_url']).toEqual({
        value: 'hook.io',
        match_mode: 'contains',
      })
    })
  })

  // ── State restoration ────────────────────────────────────────────────

  describe('state restoration', () => {
    it('should restore status from persisted MatchModel format', async () => {
      tableStateSpy.load.and.returnValue({
        filters: {
          status: { value: 'INACTIVE', match_mode: 'equals' },
        },
        page: 2,
      })

      // Re-create the component so the constructor reads the new state
      fixture = TestBed.createComponent(WebhooksComponent)
      component = fixture.componentInstance

      expect(component.filterStatus).toBe('INACTIVE')
    })

    it('should restore status from legacy plain-string format', async () => {
      tableStateSpy.load.and.returnValue({
        filters: {
          status: 'ACTIVE',
        },
        page: 1,
      })

      fixture = TestBed.createComponent(WebhooksComponent)
      component = fixture.componentInstance

      expect(component.filterStatus).toBe('ACTIVE')
    })
  })

  // ── Global facility scope ─────────────────────────────────────────────

  describe('renderedColumns', () => {
    // Operator-level webhooks have no facility: the column follows
    // isSingleWithoutNulls, not isSingle.
    let isSingle: ReturnType<typeof signal<boolean>>
    let selectedIds: ReturnType<typeof signal<string[]>>

    beforeEach(() => {
      const scope = TestBed.inject(FacilityScopeService) as unknown as {
        isSingleWithoutNulls: ReturnType<typeof signal<boolean>>
        selectedIds: ReturnType<typeof signal<string[]>>
      }
      isSingle = scope.isSingleWithoutNulls
      selectedIds = scope.selectedIds
    })

    it('renders every chosen column when several facilities are in scope', () => {
      expect(component.renderedColumns().map((c) => c.field)).toContain('facility')
    })

    it('drops the facility column when a single facility is in scope', () => {
      isSingle.set(true)
      const fields = component.renderedColumns().map((c) => c.field)
      expect(fields).not.toContain('facility')
      expect(fields).toContain('scope')
      expect(fields.length).toBe(component.columnsSelect.length - 1)
    })

    it('returns the same array between checks, so p-table does not re-render', () => {
      isSingle.set(true)
      expect(component.renderedColumns()).toBe(component.renderedColumns())
    })

    describe('scope effect', () => {
      function createWithSavedFacilityFilter(): void {
        tableStateSpy.load.and.returnValue({
          filters: { facility_id: { value: ['f9'], match_mode: 'in' } },
          page: 3,
        })
        fixture = TestBed.createComponent(WebhooksComponent)
        component = fixture.componentInstance
      }

      it('on first run, drops a restored facility filter the hidden column would carry', () => {
        isSingle.set(true)
        createWithSavedFacilityFilter()
        expect(component.filterFacilityIds).toEqual(['f9'])

        fixture.detectChanges()

        expect(component.filterFacilityIds).toEqual([])
        expect(component.webhookFilterDto().filter['facility_id']).toBeUndefined()
        expect(component.webhookFilterDto().config.page).toBe(1)
      })

      it('on first run, keeps that filter while the column is visible', () => {
        createWithSavedFacilityFilter()

        fixture.detectChanges()

        expect(component.filterFacilityIds).toEqual(['f9'])
        expect(component.webhookFilterDto().filter['facility_id']).toBeDefined()
      })

      it('does not reload when only the column state moves (same request)', () => {
        fixture.detectChanges()
        const dto = component.webhookFilterDto()

        isSingle.set(true)
        fixture.detectChanges()

        expect(component.webhookFilterDto()).toBe(dto)
      })

      it('reloads from page 1 when the ticked ids move', () => {
        fixture.detectChanges()
        component.webhookFilterDto.update((d) => ({ ...d, config: { ...d.config, page: 4 } }))
        const dto = component.webhookFilterDto()

        selectedIds.set(['f1', 'f2'])
        fixture.detectChanges()

        expect(component.webhookFilterDto()).not.toBe(dto)
        expect(component.webhookFilterDto().config.page).toBe(1)
      })
    })

    it('follows the column chooser', () => {
      isSingle.set(true)
      component.columnsSelect = component.columnsSelect.filter((c) => c.field !== 'scope')
      expect(component.renderedColumns().map((c) => c.field)).not.toContain('scope')
    })
  })

  // ── "No facility" option ──────────────────────────────────────────────

  describe('"No facility" filter option', () => {
    const NULL_ID = '__NULL__'
    let scope: {
      inScope: ReturnType<typeof signal<{ id: string; name: string }[]>>
      apiValue: ReturnType<typeof signal<(string | null)[] | null>>
      includesNoFacility: ReturnType<typeof signal<boolean>>
    }
    let list: jasmine.Spy

    beforeEach(() => {
      scope = TestBed.inject(FacilityScopeService) as unknown as typeof scope
      list = (TestBed.inject(WebhookService) as unknown as { postListFilterWebhooks: jasmine.Spy })
        .postListFilterWebhooks
    })

    function sentFacilityFilter(): unknown {
      list.calls.reset()
      component.initData()
      return list.calls.mostRecent().args[0].filter['facility_id']
    }

    it('is offered first, ahead of the facilities in scope', () => {
      scope.inScope.set([{ id: 'f1', name: 'Bodega Norte' }, { id: 'f2', name: 'Bodega Sur' }])

      const options = component.facilityFilterOptions()

      expect(options.map((o) => o.id)).toEqual([NULL_ID, 'f1', 'f2'])
      expect(options[0].name).toBe('labels.no_facility_option')
    })

    it('is not offered while the topbar scope leaves records without a facility out', () => {
      scope.inScope.set([{ id: 'f1', name: 'Bodega Norte' }])
      scope.includesNoFacility.set(false)

      expect(component.facilityFilterOptions().map((o) => o.id)).toEqual(['f1'])
    })

    it('stays in the filter state as the sentinel, so a restored filter shows it ticked', () => {
      component.filterFacilityIds = [NULL_ID]
      component.applyWebhookFilters()

      expect(component.webhookFilterDto().filter['facility_id']).toEqual({
        value: [NULL_ID],
        match_mode: 'in',
      })
    })

    it('is sent as null, which the backend reads as facility_id IS NULL', () => {
      component.filterFacilityIds = [NULL_ID, 'f1']
      component.applyWebhookFilters()

      expect(sentFacilityFilter()).toEqual({ value: [null, 'f1'], match_mode: 'in' })
    })

    it('alone, with a narrowed scope that includes it, asks only for operator-level webhooks', () => {
      scope.apiValue.set(['f1', 'f2', null])
      component.filterFacilityIds = [NULL_ID]
      component.applyWebhookFilters()

      expect(sentFacilityFilter()).toEqual({ value: [null], match_mode: 'in' })
    })

    it('left out, a facility filter does not bring operator-level webhooks along', () => {
      scope.apiValue.set(['f1', 'f2', null])
      component.filterFacilityIds = ['f1']
      component.applyWebhookFilters()

      expect(sentFacilityFilter()).toEqual({ value: ['f1'], match_mode: 'in' })
    })

    it('without any facility filter, follows the topbar: operator-level webhooks only if it includes them', () => {
      scope.apiValue.set(['f1', 'f2'])
      expect(sentFacilityFilter()).toEqual({ value: ['f1', 'f2'], match_mode: 'in' })

      scope.apiValue.set(['f1', null])
      expect(sentFacilityFilter()).toEqual({ value: ['f1', null], match_mode: 'in' })
    })

    it('shows its label on the filter chip', () => {
      component.filterFacilityIds = [NULL_ID]
      component.applyWebhookFilters()

      const chip = component.webhookFilterChips.find((c) => c.field === 'facility_id')
      expect(chip?.displayValue).toBe('labels.no_facility_option')
    })
  })
})
