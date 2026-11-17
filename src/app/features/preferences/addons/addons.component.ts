import { ChangeDetectionStrategy, Component, computed, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ChipModule } from 'primeng/chip';
import { TranslateModule } from '@ngx-translate/core';
import { AddonsService } from './services/addons.service';
import { AddonApplicationDto, AddonApplicationWithConfig } from './services/addons.types';
import { AddonFormComponent } from './components/addon-form/addon-form.component';

@Component({
  selector: 'app-addons',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AutoCompleteModule,
    ChipModule,
    TranslateModule,
    AddonFormComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './addons.component.html',
  styleUrl: './addons.component.scss',
})
export class AddonsComponent implements OnInit {
  public readonly service = inject(AddonsService);

  @ViewChild('addonForm') addonForm!: AddonFormComponent;

  selectedAddon: AddonApplicationDto | null = null;
  filteredAddons: AddonApplicationDto[] = [];

  // Computed signal to merge applications and configurations for active configured items
  configuredAddons = computed(() => {
    const apps = this.service.applications();
    const configs = this.service.configs();
    const companies = this.service.companies();
    
    return configs.map(config => {
      const app = apps.find(a => a.id === config.application_id);
      const comp = companies.find(c => c.id === config.company_id);
      
      if (!app) return null;
      
      const merged: AddonApplicationWithConfig = {
        ...app,
        config: {
          ...config,
          company_name: comp?.name
        }
      };
      return merged;
    }).filter(item => item !== null);
  });

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    const config = { page: 1, rows: 1000, sort_field: [{ field: 'name', order: 1 }] };
    this.service.loadApplications({ filter: {}, config });
    this.service.loadConfigs({ filter: {}, config });
    this.service.loadCompanies({ filter: {}, config });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filterAddons(event: any) {
    const query = event.query.toLowerCase();
    this.filteredAddons = this.service.applications().filter(
      (addon) =>
        addon.name.toLowerCase().includes(query) ||
        addon.description.toLowerCase().includes(query)
    );
  }

  onAddonSelect(event: any) {
    const selected = event.value as AddonApplicationDto;
    this.selectedAddon = null; // Clear the selection visually if needed or just open modal
    this.addonForm.open(selected);
  }

  openModalCreateUpdate(item: AddonApplicationWithConfig) {
    this.addonForm.open(item, item.config);
  }
}
