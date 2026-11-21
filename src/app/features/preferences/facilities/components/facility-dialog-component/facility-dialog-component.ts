import {
    AbstractControl,
    FormControl,
    FormGroup,
    FormsModule,
    ReactiveFormsModule,
    ValidationErrors,
    Validators,
} from '@angular/forms';
import {
    AfterViewInit,
    Component,
    DestroyRef,
    effect,
    inject,
    OnDestroy,
    OnInit,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DEFAULT_TIME_ZONE, supportedTimeZones } from '@/app/shared/utils/time-zone.util';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ProgressBarModule } from 'primeng/progressbar';
import { ToastModule } from 'primeng/toast';
import { KeyFilterModule } from 'primeng/keyfilter';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { TranslateLanService } from '../../../../../core/services/translate-lan.service';
import { FacilitiesService } from '../../facilities.service';
import { Facility } from '../../facilities.types';
import * as L from 'leaflet';

/** Zone a new facility gets when its country (ISO alpha-3) is picked. */
const COUNTRY_TIME_ZONES: Record<string, string> = {
    BOL: 'America/La_Paz',
    CHL: 'America/Santiago',
    PER: 'America/Lima',
    ARG: 'America/Argentina/Buenos_Aires',
    PRY: 'America/Asuncion',
    URY: 'America/Montevideo',
    COL: 'America/Bogota',
    ECU: 'America/Guayaquil',
    BRA: 'America/Sao_Paulo',
    MEX: 'America/Mexico_City',
};

// ── Leaflet default icon fix ──────────────────────────────────────────────────
const defaultIcon = L.icon({
    iconUrl:       'assets/leaflet/marker-icon.png',
    iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
    shadowUrl:     'assets/leaflet/marker-shadow.png',
    iconSize:    [25, 41],
    iconAnchor:  [12, 41],
    popupAnchor: [1, -34],
    shadowSize:  [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

// ── Helpers ───────────────────────────────────────────────────────────────────

const noWhitespace = (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const v = control.value.toString();
    if (v.trim().length === 0) return { whitespace: true };
    if (v !== v.trim() || /\s{2,}/.test(v)) return { extraSpaces: true };
    return null;
};

/** Rejects null, undefined, and 0 — used for lat/lng so the user must place a map pin */
const nonZeroRequired = (control: AbstractControl): ValidationErrors | null => {
    const v = control.value;
    if (v === null || v === undefined || v === 0 || v === '') return { required: true };
    return null;
};

/** Full ISO 3166-1 alpha-3 → alpha-2 mapping (derived from FULL_ALPHA2_TO_ALPHA3 below) */
const ALPHA3_TO_ALPHA2: Record<string, string> = {};

/** Complete ISO 3166-1 alpha-2 → alpha-3 mapping for all countries */
const FULL_ALPHA2_TO_ALPHA3: Record<string, string> = {
    "AF": "AFG", "AX": "ALA", "AL": "ALB", "DZ": "DZA", "AS": "ASM", "AD": "AND", "AO": "AGO", "AI": "AIA", "AQ": "ATA", "AG": "ATG",
    "AR": "ARG", "AM": "ARM", "AW": "ABW", "AU": "AUS", "AT": "AUT", "AZ": "AZE", "BS": "BHS", "BH": "BHR", "BD": "BGD", "BB": "BRB",
    "BY": "BLR", "BE": "BEL", "BZ": "BLZ", "BJ": "BEN", "BM": "BMU", "BT": "BTN", "BO": "BOL", "BQ": "BES", "BA": "BIH", "BW": "BWA",
    "BV": "BVT", "BR": "BRA", "IO": "IOT", "BN": "BRN", "BG": "BGR", "BF": "BFA", "BI": "BDI", "CV": "CPV", "KH": "KHM", "CM": "CMR",
    "CA": "CAN", "KY": "CYM", "CF": "CAF", "TD": "TCD", "CL": "CHL", "CN": "CHN", "CX": "CXR", "CC": "CCK", "CO": "COL", "KM": "COM",
    "CG": "COG", "CD": "COD", "CK": "COK", "CR": "CRI", "CI": "CIV", "HR": "HRV", "CU": "CUB", "CW": "CUW", "CY": "CYP", "CZ": "CZE",
    "DK": "DNK", "DJ": "DJI", "DM": "DMA", "DO": "DOM", "EC": "ECU", "EG": "EGY", "SV": "SLV", "GQ": "GNQ", "ER": "ERI", "EE": "EST",
    "SZ": "SWZ", "ET": "ETH", "FK": "FLK", "FO": "FRO", "FJ": "FJI", "FI": "FIN", "FR": "FRA", "GF": "GUF", "PF": "PYF", "TF": "ATF",
    "GA": "GAB", "GM": "GMB", "GE": "GEO", "DE": "DEU", "GH": "GHA", "GI": "GIB", "GR": "GRC", "GL": "GRL", "GD": "GRD", "GP": "GLP",
    "GU": "GUM", "GT": "GTM", "GG": "GGY", "GN": "GIN", "GW": "GNB", "GY": "GUY", "HT": "HTI", "HM": "HMD", "VA": "VAT", "HN": "HND",
    "HK": "HKG", "HU": "HUN", "IS": "ISL", "IN": "IND", "ID": "IDN", "IR": "IRN", "IQ": "IRQ", "IE": "IRL", "IM": "IMN", "IL": "ISR",
    "IT": "ITA", "JM": "JAM", "JP": "JPN", "JE": "JEY", "JO": "JOR", "KZ": "KAZ", "KE": "KEN", "KI": "KIR", "KP": "PRK", "KR": "KOR",
    "KW": "KWT", "KG": "KGZ", "LA": "LAO", "LV": "LVA", "LB": "LBN", "LS": "LSO", "LR": "LBR", "LY": "LBY", "LI": "LIE", "LT": "LTU",
    "LU": "LUX", "MO": "MAC", "MG": "MDG", "MW": "MWI", "MY": "MYS", "MV": "MDV", "ML": "MLI", "MT": "MLT", "MH": "MHL", "MQ": "MTQ",
    "MR": "MRT", "MU": "MUS", "YT": "MYT", "MX": "MEX", "FM": "FSM", "MD": "MDA", "MC": "MCO", "MN": "MNG", "ME": "MNE", "MS": "MSR",
    "MA": "MAR", "MZ": "MOZ", "MM": "MMR", "NA": "NAM", "NR": "NRU", "NP": "NPL", "NL": "NLD", "NC": "NCL", "NZ": "NZL", "NI": "NIC",
    "NE": "NER", "NG": "NGA", "NU": "NIU", "NF": "NFK", "MK": "MKD", "MP": "MNP", "NO": "NOR", "OM": "OMN", "PK": "PAK", "PW": "PLW",
    "PS": "PSE", "PA": "PAN", "PG": "PNG", "PY": "PRY", "PE": "PER", "PH": "PHL", "PN": "PCN", "PL": "POL", "PT": "PRT", "PR": "PRI",
    "QA": "QAT", "RE": "REU", "RO": "ROU", "RU": "RUS", "RW": "RWA", "BL": "BLM", "SH": "SHN", "KN": "KNA", "LC": "LCA", "MF": "MAF",
    "PM": "SPM", "VC": "VCT", "WS": "WSM", "SM": "SMR", "ST": "STP", "SA": "SAU", "SN": "SEN", "RS": "SRB", "SC": "SYC", "SL": "SLE",
    "SG": "SGP", "SX": "SXM", "SK": "SVK", "SI": "SVN", "SB": "SLB", "SO": "SOM", "ZA": "ZAF", "GS": "SGS", "SS": "SSD", "ES": "ESP",
    "LK": "LKA", "SD": "SDN", "SR": "SUR", "SJ": "SJM", "SE": "SWE", "CH": "CHE", "SY": "SYR", "TW": "TWN", "TJ": "TJK", "TZ": "TZA",
    "TH": "THA", "TL": "TLS", "TG": "TGO", "TK": "TKL", "TO": "TON", "TT": "TTO", "TN": "TUN", "TR": "TUR", "TM": "TKM", "TC": "TCA",
    "TV": "TUV", "UG": "UGA", "UA": "UKR", "AE": "ARE", "GB": "GBR", "US": "USA", "UM": "UMI", "UY": "URY", "UZ": "UZB", "VU": "VUT",
    "VE": "VEN", "VN": "VNM", "VG": "VGB", "VI": "VIR", "WF": "WLF", "EH": "ESH", "YE": "YEM", "ZM": "ZMB", "ZW": "ZWE"
};

// Populate ALPHA3_TO_ALPHA2 by inverting FULL_ALPHA2_TO_ALPHA3 at module load time
Object.entries(FULL_ALPHA2_TO_ALPHA3).forEach(([a2, a3]) => { ALPHA3_TO_ALPHA2[a3] = a2; });

/** All alpha-3 country codes derived from FULL_ALPHA2_TO_ALPHA3 */
const ALL_COUNTRY_CODES: string[] = Object.values(FULL_ALPHA2_TO_ALPHA3);

@Component({
    selector: 'app-facility-dialog-component',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        TranslateModule,
        ButtonModule,
        InputTextModule,
        SelectModule,
        ProgressBarModule,
        ToastModule,
        KeyFilterModule,
        ToggleSwitchModule,
    ],
    providers: [MessageService],
    templateUrl: './facility-dialog-component.html',
    styleUrl: './facility-dialog-component.scss',
})
export class FacilityDialogComponent implements OnInit, AfterViewInit, OnDestroy {

    private readonly ref            = inject(DynamicDialogRef);
    private readonly config         = inject(DynamicDialogConfig);
    private readonly svc            = inject(FacilitiesService);
    private readonly translate      = inject(TranslateService);
    private readonly translateLan   = inject(TranslateLanService);
    private readonly messageService = inject(MessageService);
    private readonly destroyRef     = inject(DestroyRef);

    facility: Facility | undefined;
    form!: FormGroup;
    /** Rejects single (') and double (") quotes on keystroke */
    readonly codeKeyFilter = /[^'"]/;
    isLoading       = signal(false);
    isSearching     = signal(false);
    searchQuery     = signal('');
    searchResults   = signal<NominatimResult[]>([]);
    showSuggestions = signal(false);
    countries: { label: string; value: string }[] = [];
    /** IANA zones for the time zone select ('America/La_Paz' shown as 'America / La Paz'). */
    readonly timeZones = supportedTimeZones().map((z) => ({ value: z, label: z.replace(/_/g, ' ').replace(/\//g, ' / ') }));

    // ── Leaflet ──────────────────────────────────────────────────────────
    private map!: L.Map;
    private marker?: L.Marker;
    lat = signal<number | null>(null);
    lng = signal<number | null>(null);
    /** Controls whether the address fields are editable. Default false on create, true on edit. */
    addressEnabled = signal(false);

    constructor() {
        effect(() => this.translate.use(this.translateLan.changeLanguage()));
        this.facility = this.config.data?.facility as Facility | undefined;
    }

    ngOnInit(): void {
        this.initForm();
        this.loadCountries();
        this.translate.onLangChange.subscribe(() => this.loadCountries());
    }

    ngAfterViewInit(): void {
        // Wait for PrimeNG DynamicDialog animation to finish before
        // initialising Leaflet so it can measure the container correctly.
        setTimeout(() => this.initMap(), 150);
    }

    ngOnDestroy(): void {
        this.map?.remove();
    }

    // ── Setup ──────────────────────────────────────────────────────────────

    loadCountries(): void {
        this.countries = ALL_COUNTRY_CODES
            .map(code => {
                const key = `countries.${code}`;
                const translated = this.translate.instant(key);
                const name = translated === key ? code : translated;
                const a2 = ALPHA3_TO_ALPHA2[code] ?? code;
                return { label: `${name} (${a2})`, value: code };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    initForm(): void {
        const f = this.facility;
        const initLat = f?.address?.coordinates?.lat ?? 0;
        const initLng = f?.address?.coordinates?.lng ?? 0;

        this.form = new FormGroup({
            // General
            name:            new FormControl(f?.name ?? '',            [Validators.required, Validators.minLength(2), Validators.maxLength(50), noWhitespace]),
            code:            new FormControl(f?.code ?? '',            [Validators.required, Validators.minLength(2), noWhitespace]),
            external_ref_id: new FormControl(f?.external_ref_id ?? ''),
            time_zone:       new FormControl(f?.time_zone ?? DEFAULT_TIME_ZONE, [Validators.required]),

            // Address — controls start disabled when creating a new facility
            street:         new FormControl({ value: f?.address?.street        ?? '', disabled: !f }, [Validators.required, noWhitespace]),
            city:           new FormControl({ value: f?.address?.city          ?? '', disabled: !f }, [Validators.required, noWhitespace]),
            state_province: new FormControl({ value: f?.address?.state_province ?? '', disabled: !f }, [Validators.required, noWhitespace]),
            zip_code:       new FormControl({ value: f?.address?.zip_code      ?? '', disabled: !f }, [Validators.required, noWhitespace]),
            country_code:   new FormControl({ value: f?.address?.country_code  ?? '', disabled: !f }, [Validators.required]),
            reference:      new FormControl(f?.address?.reference     ?? ''),
            lat:            new FormControl(initLat, [nonZeroRequired]),
            lng:            new FormControl(initLng, [nonZeroRequired]),
        });

        // A new facility takes the zone of its country until the user picks one.
        if (!f) {
            this.form.get('country_code')!.valueChanges
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe((cc: string) => {
                    const tz = this.form.get('time_zone')!;
                    const suggested = COUNTRY_TIME_ZONES[cc];
                    if (suggested && !tz.dirty) tz.setValue(suggested);
                });
        }

        // If editing an existing facility, address is enabled by default
        if (f) this.addressEnabled.set(true);

        // Seed map coords signals
        if (initLat && initLng) {
            this.lat.set(initLat);
            this.lng.set(initLng);
        }
    }

    initMap(): void {
        const initLat = this.form.get('lat')?.value || 0;
        const initLng = this.form.get('lng')?.value || 0;
        const hasCoords = initLat !== 0 && initLng !== 0;

        this.map = L.map('facility-map').setView(
            [initLat, initLng],
            hasCoords ? 15 : 2,
        );

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© OpenStreetMap',
        }).addTo(this.map);

        // Force Leaflet to recalculate tile layout after the container is visible.
        this.map.invalidateSize();

        if (hasCoords) {
            this.marker = this.createDraggableMarker(initLat, initLng);
        }

        this.map.on('click', (e: L.LeafletMouseEvent) => {
            this.updateMarker(e.latlng.lat, e.latlng.lng);
        });
    }

    /**
     * Crea un marcador draggable y suscribe el evento dragend para
     * sincronizar lat/lng con los signals, el formulario y la dirección.
     */
    private createDraggableMarker(lat: number, lng: number): L.Marker {
        const m = L.marker([lat, lng], { draggable: true }).addTo(this.map);
        m.on('dragend', () => {
            const pos = m.getLatLng();
            // Actualiza coords SIN recrear el marcador
            this.lat.set(pos.lat);
            this.lng.set(pos.lng);
            this.form.get('lat')?.setValue(pos.lat);
            this.form.get('lng')?.setValue(pos.lng);
            // Geocodificación inversa para rellenar los campos de dirección
            this.geocodificacionInversa(pos.lat, pos.lng);
        });
        return m;
    }

    private updateMarker(lat: number, lng: number): void {
        this.lat.set(lat);
        this.lng.set(lng);
        this.form.get('lat')?.setValue(lat);
        this.form.get('lng')?.setValue(lng);

        if (this.marker) this.map.removeLayer(this.marker);
        this.marker = this.createDraggableMarker(lat, lng);
        // Geocodificación inversa para rellenar los campos de dirección
        this.geocodificacionInversa(lat, lng);
    }

    // ── Geocoding (Reverse) ─────────────────────────────────────────────

    /**
     * Geocodificación inversa: a partir de lat/lng obtiene la dirección
     * de Nominatim y rellena los campos street, city, state, zip y country.
     */
    private geocodificacionInversa(lat: number, lng: number): void {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`;

        fetch(url, {
            method: 'GET',
            credentials: 'omit',
            headers: { 'Accept': 'application/json' },
        })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json() as Promise<NominatimResult>;
        })
        .then(result => {
            console.log('[Nominatim Reverse] Dirección obtenida:', result);
            if (result.error) {
                this.clearAddressFields();
                this.messageService.add({
                    severity: 'warn',
                    summary: this.translate.instant('common.warning'),
                    detail: this.translate.instant('preferences.facilities.geocode_error'),
                    life: 4000,
                });
                return;
            }
            this.rellenarDireccion(result.address);
        })
        .catch(err => {
            console.error('[Nominatim Reverse] Error:', err);
            this.clearAddressFields();
            this.messageService.add({
                severity: 'warn',
                summary: this.translate.instant('common.warning'),
                detail: this.translate.instant('preferences.facilities.geocode_error'),
                life: 4000,
            });
        });
    }

    /**
     * Parsea el objeto NominatimAddress y escribe los valores en el formulario.
     * Usado tanto por forward como reverse geocoding.
     */
    /** Blanks all address-related form controls. Called when geocoding fails. */
    private clearAddressFields(): void {
        this.form.get('street')?.setValue('');
        this.form.get('city')?.setValue('');
        this.form.get('state_province')?.setValue('');
        this.form.get('zip_code')?.setValue('');
    }

    /** Called by the address toggle switch. Enables or disables the address form controls. */
    toggleAddressFields(enabled: boolean): void {
        this.addressEnabled.set(enabled);
        const fields = ['street', 'city', 'state_province', 'zip_code', 'country_code'];
        if (enabled) {
            fields.forEach(f => this.form.get(f)?.enable());
        } else {
            fields.forEach(f => this.form.get(f)?.disable());
            
            // Clear address text fields
            this.clearAddressFields();
            this.form.get('country_code')?.setValue('');
            
            // Clear geocoder search
            this.searchQuery.set('');
            this.searchResults.set([]);
            
            // Reset coordinates
            this.form.get('lat')?.setValue(0);
            this.form.get('lng')?.setValue(0);
            this.lat.set(null);
            this.lng.set(null);
            
            // Reset Map to default
            if (this.map) {
                this.map.setView([0, 0], 2);
                if (this.marker) {
                    this.map.removeLayer(this.marker);
                    this.marker = undefined;
                }
            }
        }
    }

    private rellenarDireccion(addr: NominatimAddress | undefined): void {
        if (!addr) return;

        const street = addr.road ?? addr.pedestrian ?? addr.footway ?? addr.path ?? '';
        this.form.get('street')?.setValue(street);

        const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county ?? '';
        this.form.get('city')?.setValue(city);

        const state = addr.state ?? addr.province ?? addr.region ?? '';
        this.form.get('state_province')?.setValue(state);

        this.form.get('zip_code')?.setValue(addr.postcode ?? '');

        if (addr.country_code) {
            const a2 = addr.country_code.toUpperCase();
            const alpha3 = FULL_ALPHA2_TO_ALPHA3[a2];
            if (alpha3) {
                // Check if the country code exists in the dropdown options
                const exists = this.countries.some(c => c.value === alpha3);
                if (!exists) {
                    // Dynamically add the country returned by the map API to the options list
                    const name = addr.country || alpha3;
                    const newCountry = {
                        label: `${name} (${a2})`,
                        value: alpha3
                    };
                    this.countries = [...this.countries, newCountry].sort((a, b) => a.label.localeCompare(b.label));
                }
                this.form.get('country_code')?.setValue(alpha3);
            }
        }
    }

    // ── Geocoding (Forward) ───────────────────────────────────────────────

    /**
     * Actualiza searchQuery en cada keystroke.
     * La búsqueda solo se lanza al pulsar el botón o Enter.
     */
    onSearchInput(value: string): void {
        this.searchQuery.set(value);
        if (!value.trim()) {
            this.searchResults.set([]);
            this.showSuggestions.set(false);
        }
    }

    /**
     * Busca en Nominatim y puebla el dropdown de sugerencias (limit = 5).
     * También se llama directamente desde el botón / Enter para búsqueda inmediata.
     */
    buscarDireccion(direccion: string): void {
        const query = direccion.trim();
        if (!query) return;

        this.isSearching.set(true);
        this.showSuggestions.set(false);

        // addressdetails=1 → Nominatim incluye el objeto `address` con campos individuales
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=5`;

        // fetch() nativo con credentials:'omit' para evitar el interceptor global
        // de Angular (withCredentials:true es incompatible con CORS wildcard de Nominatim).
        fetch(url, {
            method: 'GET',
            credentials: 'omit',
            headers: { 'Accept': 'application/json' },
        })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json() as Promise<NominatimResult[]>;
        })
        .then(results => {
            console.log('[Nominatim] Resultados devueltos por la API:', results);

            if (!results || results.length === 0) {
                this.searchResults.set([]);
                this.showSuggestions.set(false);
                this.messageService.add({
                    severity: 'warn',
                    summary: this.translate.instant('preferences.facilities.geocoding.not_found_summary'),
                    detail:  this.translate.instant('preferences.facilities.geocoding.not_found_detail'),
                });
                console.warn('[Nominatim] No se encontraron resultados para:', query);
                return;
            }

            this.searchResults.set(results);
            this.showSuggestions.set(true);
        })
        .catch(err => {
            console.error('[Nominatim] Error en la petición a la API:', err);
            this.messageService.add({
                severity: 'error',
                summary: this.translate.instant('preferences.facilities.geocoding.error_summary'),
                detail:  this.translate.instant('preferences.facilities.geocoding.error_detail'),
            });
        })
        .finally(() => this.isSearching.set(false));
    }

    /**
     * Aplica el resultado seleccionado del dropdown:
     * mueve el mapa, coloca el marcador y rellena los campos del formulario.
     */
    seleccionarResultado(result: NominatimResult): void {
        this.showSuggestions.set(false);
        this.searchQuery.set(result.display_name);

        const lat = Number.parseFloat(result.lat);
        const lon = Number.parseFloat(result.lon);

        console.log('[Nominatim] Resultado seleccionado → lat:', lat, 'lon:', lon);
        console.log('[Nominatim] Dirección completa:', result.display_name);
        console.log('[Nominatim] Detalle de dirección:', result.address);

        // Rellenar campos de dirección (ya tenemos el address del forward geocoding)
        this.rellenarDireccion(result.address);

        // Actualizar coords en signals y form
        this.lat.set(lat);
        this.lng.set(lon);
        this.form.get('lat')?.setValue(lat);
        this.form.get('lng')?.setValue(lon);

        // Mover cámara y marcador sin disparar reverse geocoding adicional
        this.map.setView([lat, lon], 16);
        if (this.marker) this.map.removeLayer(this.marker);
        this.marker = this.createDraggableMarker(lat, lon);
        this.marker.bindPopup(`<strong>${result.display_name}</strong>`).openPopup();
    }

    /** Cierra el dropdown con un pequeño delay para que el mousedown del item se registre primero. */
    cerrarSugerencias(): void {
        setTimeout(() => this.showSuggestions.set(false), 200);
    }

    // ── Actions ───────────────────────────────────────────────────────────

    save(): void {
        this.touchAll();
        if (!this.form.valid) return;

        const v = this.form.getRawValue();
        const clean = (s: string) => (s ?? '').trim().replaceAll(/\s+/g, ' ');
        const payload: Partial<Facility> = {
            name:            clean(v.name),
            code:            clean(v.code),
            external_ref_id: v.external_ref_id ? clean(v.external_ref_id) : undefined,
            time_zone:       v.time_zone,
            address: {
                street:         clean(v.street),
                city:           clean(v.city),
                state_province: clean(v.state_province),
                zip_code:       clean(v.zip_code),
                country_code:   v.country_code,
                reference:      v.reference ? clean(v.reference) : undefined,
                coordinates: {
                    lat: v.lat ?? 0,
                    lng: v.lng ?? 0,
                },
            },
        };

        this.isLoading.set(true);

        const req = this.facility?.id
            ? this.svc.updateFacility(this.facility.id, payload)
            : this.svc.createFacility(payload);

        req.subscribe({
            next: (result: Facility) => {
                this.messageService.add({
                    severity: 'success',
                    summary: this.translate.instant('common.success'),
                    detail: this.translate.instant(
                        this.facility?.id ? 'messages.update_success' : 'messages.create_success'
                    ),
                });
                this.ref.close(result);
            },
            error: (err: any) => {
                this.isLoading.set(false);
                // The error interceptor re-throws the parsed v2Error object directly,
                // so `err` IS { success, code, message } — not a HttpErrorResponse wrapper.
                const errorKey = err?.code ?? err?.error?.code ?? err?.error?.message;
                const detail = errorKey
                    ? this.translate.instant(`preferences.facilities.${errorKey}`)
                    : this.translate.instant('messages.save_error');
                this.messageService.add({ severity: 'error', summary: 'Error', detail });
            },
        });
    }

    cancel(): void { this.ref.close(); }

    // ── Validation helpers ────────────────────────────────────────────────

    isInvalid(field: string): boolean {
        const ctrl = this.form.get(field);
        return !!(ctrl?.invalid && (ctrl.dirty || ctrl.touched));
    }

    isFormValid(): boolean {
        if (!this.form) return false;
        if (this.form.invalid) return false;

        // Since address fields can be disabled (which excludes them from form.valid),
        // we manually check that all required address fields have non-empty raw values.
        const raw = this.form.getRawValue();
        const requiredAddressFields = ['street', 'city', 'state_province', 'zip_code', 'country_code'];
        for (const field of requiredAddressFields) {
            const val = raw[field];
            if (!val || (typeof val === 'string' && !val.trim())) {
                return false;
            }
        }
        return true;
    }

    getError(field: string): string {
        const ctrl = this.form.get(field);
        if (!ctrl?.errors) return '';
        if (ctrl.errors['required'])    return this.translate.instant('forms_validation.required');
        if (ctrl.errors['minlength'])   return this.translate.instant('forms_validation.number_characters_3');
        if (ctrl.errors['whitespace'])  return this.translate.instant('forms_validation.whitespace_not_allowed');
        if (ctrl.errors['extraSpaces']) return this.translate.instant('forms_validation.extra_spaces_not_allowed');
        if (ctrl.errors['pattern'])     return this.translate.instant('forms_validation.invalid_format');
        return '';
    }

    private touchAll(): void {
        Object.values(this.form.controls).forEach(c => c.markAsTouched());
    }
}

// ── Nominatim API response shape ─────────────────────────────────────────────
interface NominatimAddress {
    road?:          string;   // calle principal
    pedestrian?:    string;   // vía peatonal
    footway?:       string;
    path?:          string;
    city?:          string;
    town?:          string;
    village?:       string;
    municipality?:  string;
    county?:        string;
    state?:         string;
    province?:      string;
    region?:        string;
    postcode?:      string;
    country?:       string;
    country_code?:  string;   // alpha-2 en minúsculas (ej: "us")
    [key: string]:  string | undefined;
}

interface NominatimResult {
    place_id:      number;
    lat:           string;
    lon:           string;
    display_name:  string;
    address?:      NominatimAddress;
    error?:        string;
    [key: string]: unknown;
}
