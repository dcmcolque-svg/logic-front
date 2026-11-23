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
import { TooltipModule } from 'primeng/tooltip';
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
        TooltipModule,
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
    /** Suggestion highlighted by the keyboard (-1 = none). */
    activeSuggestion = signal(-1);
    isLocating        = signal(false);
    isReverseGeocoding = signal(false);
    /** Bumped on every reverse lookup so a slow, stale answer never overwrites a newer pin. */
    private reverseSeq = 0;
    countries: { label: string; value: string }[] = [];
    /** IANA zones for the time zone select ('America/La_Paz' shown as 'America / La Paz'). */
    readonly timeZones = supportedTimeZones().map((z) => ({ value: z, label: z.replace(/_/g, ' ').replace(/\//g, ' / ') }));

    // ── Leaflet ──────────────────────────────────────────────────────────
    private map!: L.Map;
    private marker?: L.Marker;
    lat = signal<number | null>(null);
    lng = signal<number | null>(null);

    constructor() {
        effect(() => this.translate.use(this.translateLan.changeLanguage()));
        this.facility = this.config.data?.facility as Facility | undefined;
    }

    ngOnInit(): void {
        this.initForm();
        this.loadCountries();
        this.translate.onLangChange
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.loadCountries());
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

            // Address — filled from the map pin, always editable by hand.
            // Zip is optional: many places in the region have no postal code.
            street:         new FormControl(f?.address?.street         ?? '', [Validators.required, noWhitespace]),
            city:           new FormControl(f?.address?.city           ?? '', [Validators.required, noWhitespace]),
            state_province: new FormControl(f?.address?.state_province ?? '', [Validators.required, noWhitespace]),
            zip_code:       new FormControl(f?.address?.zip_code       ?? '', [noWhitespace]),
            country_code:   new FormControl(f?.address?.country_code   ?? '', [Validators.required]),
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
        this.placePin(lat, lng);
        // Geocodificación inversa para rellenar los campos de dirección
        this.geocodificacionInversa(lat, lng);
    }

    /** Moves (or creates) the pin and syncs signals + form, without geocoding. */
    private placePin(lat: number, lng: number): L.Marker {
        this.lat.set(lat);
        this.lng.set(lng);
        this.form.get('lat')?.setValue(lat);
        this.form.get('lng')?.setValue(lng);
        this.form.get('lat')?.markAsDirty();

        if (this.marker) this.map.removeLayer(this.marker);
        this.marker = this.createDraggableMarker(lat, lng);
        return this.marker;
    }

    /** Centers the map on the browser's position and pins it. */
    usarMiUbicacion(): void {
        if (!navigator.geolocation) {
            this.warn('preferences.facilities.geolocation_error');
            return;
        }
        this.isLocating.set(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                this.isLocating.set(false);
                const { latitude, longitude } = pos.coords;
                this.map?.setView([latitude, longitude], 17);
                this.updateMarker(latitude, longitude);
            },
            () => {
                this.isLocating.set(false);
                this.warn('preferences.facilities.geolocation_error');
            },
            { enableHighAccuracy: true, timeout: 10000 },
        );
    }

    private warn(detailKey: string): void {
        this.messageService.add({
            severity: 'warn',
            summary: this.translate.instant('common.warning'),
            detail: this.translate.instant(detailKey),
            life: 4000,
        });
    }

    // ── Geocoding (Reverse) ─────────────────────────────────────────────

    /**
     * Geocodificación inversa: a partir de lat/lng obtiene la dirección
     * de Nominatim y rellena los campos street, city, state, zip y country.
     */
    private geocodificacionInversa(lat: number, lng: number): void {
        const seq = ++this.reverseSeq;
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`;
        this.isReverseGeocoding.set(true);

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
            if (seq !== this.reverseSeq) return;
            // Keep whatever the user typed: only warn, never wipe the fields.
            if (result.error) {
                this.warn('preferences.facilities.geocode_error');
                return;
            }
            this.rellenarDireccion(result.address);
        })
        .catch(() => {
            if (seq === this.reverseSeq) this.warn('preferences.facilities.geocode_error');
        })
        .finally(() => {
            if (seq === this.reverseSeq) this.isReverseGeocoding.set(false);
        });
    }

    private rellenarDireccion(addr: NominatimAddress | undefined): void {
        if (!addr) return;

        const road = addr.road ?? addr.pedestrian ?? addr.footway ?? addr.path ?? '';
        const street = [road, addr.house_number].filter(Boolean).join(' ');
        const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county ?? '';
        const state = addr.state ?? addr.province ?? addr.region ?? '';

        // Only overwrite with what the lookup actually found, so a partial
        // answer does not erase fields the user already filled in.
        const set = (field: string, value: string | undefined) => {
            const v = (value ?? '').trim().replace(/\s+/g, ' ');
            if (!v) return;
            const ctrl = this.form.get(field);
            ctrl?.setValue(v);
            ctrl?.markAsDirty();
        };
        set('street', street);
        set('city', city);
        set('state_province', state);
        set('zip_code', addr.postcode?.replace(/[^0-9A-Za-z]/g, ''));

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

    /** Arrow keys move through the suggestions, Enter picks/searches, Escape closes. */
    onSearchKeydown(event: KeyboardEvent): void {
        const open = this.showSuggestions() && this.searchResults().length > 0;
        const count = this.searchResults().length;
        switch (event.key) {
            case 'ArrowDown':
                if (!open) return;
                event.preventDefault();
                this.activeSuggestion.set((this.activeSuggestion() + 1) % count);
                break;
            case 'ArrowUp':
                if (!open) return;
                event.preventDefault();
                this.activeSuggestion.set((this.activeSuggestion() - 1 + count) % count);
                break;
            case 'Enter': {
                // Never let Enter here submit the facility form.
                event.preventDefault();
                const picked = open ? this.searchResults()[this.activeSuggestion()] : undefined;
                if (picked) this.seleccionarResultado(picked);
                else this.buscarDireccion(this.searchQuery());
                break;
            }
            case 'Escape':
                if (open) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.showSuggestions.set(false);
                }
                break;
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
            if (!results || results.length === 0) {
                this.searchResults.set([]);
                this.showSuggestions.set(false);
                this.messageService.add({
                    severity: 'warn',
                    summary: this.translate.instant('preferences.facilities.geocoding.not_found_summary'),
                    detail:  this.translate.instant('preferences.facilities.geocoding.not_found_detail'),
                });
                return;
            }

            this.searchResults.set(results);
            this.activeSuggestion.set(0);
            this.showSuggestions.set(true);
        })
        .catch(() => {
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

        // Rellenar campos de dirección (ya tenemos el address del forward geocoding)
        this.rellenarDireccion(result.address);

        // Mover cámara y marcador sin disparar reverse geocoding adicional
        this.reverseSeq++; // drop any in-flight reverse lookup from an earlier click
        this.isReverseGeocoding.set(false);
        this.map.setView([lat, lon], 17);
        const marker = this.placePin(lat, lon);
        const popup = document.createElement('strong');
        popup.textContent = result.display_name; // text, not HTML: the name comes from a third party
        marker.bindPopup(popup).openPopup();
    }

    /** Cierra el dropdown con un pequeño delay para que el mousedown del item se registre primero. */
    cerrarSugerencias(): void {
        setTimeout(() => this.showSuggestions.set(false), 200);
    }

    // ── Actions ───────────────────────────────────────────────────────────

    save(): void {
        if (this.isLoading()) return;
        this.touchAll();
        if (!this.form.valid) {
            this.warn('preferences.facilities.form_invalid');
            this.focusFirstInvalid();
            return;
        }

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

    getError(field: string): string {
        const ctrl = this.form.get(field);
        if (!ctrl?.errors) return '';
        if (ctrl.errors['required'])    return this.translate.instant('forms_validation.required');
        if (ctrl.errors['minlength'])   return this.translate.instant('forms_validation.min_length', { min: ctrl.errors['minlength'].requiredLength });
        if (ctrl.errors['maxlength'])   return this.translate.instant('forms_validation.max_length');
        if (ctrl.errors['whitespace'])  return this.translate.instant('forms_validation.whitespace_not_allowed');
        if (ctrl.errors['extraSpaces']) return this.translate.instant('forms_validation.extra_spaces_not_allowed');
        if (ctrl.errors['pattern'])     return this.translate.instant('forms_validation.invalid_format');
        return '';
    }

    private touchAll(): void {
        Object.values(this.form.controls).forEach(c => c.markAsTouched());
    }

    /** Scrolls to and focuses the first field with an error (the map when only the pin is missing). */
    private focusFirstInvalid(): void {
        const order: [string, string][] = [
            ['code', 'fac-code'], ['name', 'fac-name'], ['time_zone', 'fac-tz'],
            ['street', 'fac-street'], ['city', 'fac-city'], ['state_province', 'fac-state'],
            ['country_code', 'fac-country'], ['zip_code', 'fac-zip'], ['lat', 'map-geocoder-input'],
        ];
        const hit = order.find(([field]) => this.form.get(field)?.invalid);
        if (!hit) return;
        const el = document.getElementById(hit[1]);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus({ preventScroll: true });
    }
}

// ── Nominatim API response shape ─────────────────────────────────────────────
interface NominatimAddress {
    road?:          string;   // calle principal
    house_number?:  string;
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
