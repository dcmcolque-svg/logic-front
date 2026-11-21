/**
 * The company's look (brand theme): PrimeNG preset, primary color, surface
 * palette, menu type and sidebar style. The OWNER picks it in
 * Preferences → Appearance; it is stored per operator in
 * operator-branding.ui_settings.theme and applied to every user at start-up.
 * Light/dark stays a per-user choice (topbar profile menu).
 */
import { $t } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'
import Lara from '@primeuix/themes/lara'
import Nora from '@primeuix/themes/nora'

export const PRESETS = { Aura, Lara, Nora } as const
export type PresetName = keyof typeof PRESETS

export const MENU_MODES = ['static', 'overlay', 'slim', 'slim-plus'] as const
export type MenuMode = (typeof MENU_MODES)[number]

/** colorScheme: neutral sidebar; primaryColor: sidebar in the primary color (light theme only). */
export const LAYOUT_THEMES = ['colorScheme', 'primaryColor'] as const
export type LayoutTheme = (typeof LAYOUT_THEMES)[number]

export interface BrandTheme {
  preset: PresetName
  primary: string
  /** null: the preset's own surface. */
  surface: string | null
  menuMode: MenuMode
  layoutTheme: LayoutTheme
}

/** What the app looks like when the company has not chosen anything. */
export const DEFAULT_BRAND_THEME: BrandTheme = {
  preset: 'Aura',
  primary: 'sky',
  surface: null,
  menuMode: 'static',
  layoutTheme: 'colorScheme',
}

export interface NamedPalette {
  name: string
  palette: Record<string, string>
}

/** 'noir' is a monochrome primary built from the surface palette. */
export const PRIMARY_COLORS = [
  'noir', 'emerald', 'green', 'lime', 'orange', 'amber', 'yellow', 'teal', 'cyan',
  'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
] as const

export const SURFACES: NamedPalette[] = [
  {
    name: 'slate',
    palette: {
      0: '#ffffff',
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
  },
  {
    name: 'gray',
    palette: {
      0: '#ffffff',
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
      950: '#030712',
    },
  },
  {
    name: 'zinc',
    palette: {
      0: '#ffffff',
      50: '#fafafa',
      100: '#f4f4f5',
      200: '#e4e4e7',
      300: '#d4d4d8',
      400: '#a1a1aa',
      500: '#71717a',
      600: '#52525b',
      700: '#3f3f46',
      800: '#27272a',
      900: '#18181b',
      950: '#09090b',
    },
  },
  {
    name: 'neutral',
    palette: {
      0: '#ffffff',
      50: '#fafafa',
      100: '#f5f5f5',
      200: '#e5e5e5',
      300: '#d4d4d4',
      400: '#a3a3a3',
      500: '#737373',
      600: '#525252',
      700: '#404040',
      800: '#262626',
      900: '#171717',
      950: '#0a0a0a',
    },
  },
  {
    name: 'stone',
    palette: {
      0: '#ffffff',
      50: '#fafaf9',
      100: '#f5f5f4',
      200: '#e7e5e4',
      300: '#d6d3d1',
      400: '#a8a29e',
      500: '#78716c',
      600: '#57534e',
      700: '#44403c',
      800: '#292524',
      900: '#1c1917',
      950: '#0c0a09',
    },
  },
  {
    name: 'soho',
    palette: {
      0: '#ffffff',
      50: '#ececec',
      100: '#dedfdf',
      200: '#c4c4c6',
      300: '#adaeb0',
      400: '#97979b',
      500: '#7f8084',
      600: '#6a6b70',
      700: '#55565b',
      800: '#3f4046',
      900: '#2c2c34',
      950: '#16161d',
    },
  },
  {
    name: 'viva',
    palette: {
      0: '#ffffff',
      50: '#f3f3f3',
      100: '#e7e7e8',
      200: '#cfd0d0',
      300: '#b7b8b9',
      400: '#9fa1a1',
      500: '#87898a',
      600: '#6e7173',
      700: '#565a5b',
      800: '#3e4244',
      900: '#262b2c',
      950: '#0e1315',
    },
  },
  {
    name: 'ocean',
    palette: {
      0: '#ffffff',
      50: '#fbfcfc',
      100: '#F7F9F8',
      200: '#EFF3F2',
      300: '#DADEDD',
      400: '#B1B7B6',
      500: '#828787',
      600: '#5F7274',
      700: '#415B61',
      800: '#29444E',
      900: '#183240',
      950: '#0c1920',
    },
  },
]

/** The primary color's palette in a preset ('noir' has none: it uses the surface). */
export function primaryPalette(preset: PresetName, primary: string): Record<string, string> | undefined {
  if (primary === 'noir') return undefined
  const primitive = PRESETS[preset].primitive as Record<string, unknown> | undefined
  return primitive?.[primary] as Record<string, string> | undefined
}

/**
 * A theme from stored settings: anything unknown (an old or hand-edited value)
 * falls back to the default, so a bad record never breaks the layout.
 */
export function parseBrandTheme(raw: unknown): BrandTheme {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_BRAND_THEME
  const preset = typeof v['preset'] === 'string' && v['preset'] in PRESETS ? (v['preset'] as PresetName) : d.preset
  const primary =
    typeof v['primary'] === 'string' && (PRIMARY_COLORS as readonly string[]).includes(v['primary']) ? v['primary'] : d.primary
  const surface = typeof v['surface'] === 'string' && SURFACES.some(s => s.name === v['surface']) ? v['surface'] : null
  const menuMode = (MENU_MODES as readonly unknown[]).includes(v['menuMode']) ? (v['menuMode'] as MenuMode) : d.menuMode
  const layoutTheme = (LAYOUT_THEMES as readonly unknown[]).includes(v['layoutTheme'])
    ? (v['layoutTheme'] as LayoutTheme)
    : d.layoutTheme
  return { preset, primary, surface, menuMode, layoutTheme }
}

/** Applies the preset, primary color and surface to PrimeNG's design tokens. */
export function applyThemeTokens(theme: BrandTheme): void {
  const surface = SURFACES.find(s => s.name === theme.surface)?.palette
  $t()
    .preset(PRESETS[theme.preset])
    .preset(presetExtension(theme))
    .surfacePalette(surface)
    .use({ useDefaultOptions: true })
}

function presetExtension(theme: BrandTheme): object {
  if (theme.primary === 'noir') {
    return {
      semantic: {
        primary: {
          50: '{surface.50}', 100: '{surface.100}', 200: '{surface.200}', 300: '{surface.300}',
          400: '{surface.400}', 500: '{surface.500}', 600: '{surface.600}', 700: '{surface.700}',
          800: '{surface.800}', 900: '{surface.900}', 950: '{surface.950}',
        },
        colorScheme: {
          light: {
            primary: { color: '{primary.950}', contrastColor: '#ffffff', hoverColor: '{primary.800}', activeColor: '{primary.700}' },
            highlight: { background: '{primary.950}', focusBackground: '{primary.700}', color: '#ffffff', focusColor: '#ffffff' },
          },
          dark: {
            primary: { color: '{primary.50}', contrastColor: '{primary.950}', hoverColor: '{primary.200}', activeColor: '{primary.300}' },
            highlight: { background: '{primary.50}', focusBackground: '{primary.300}', color: '{primary.950}', focusColor: '{primary.950}' },
          },
        },
      },
    }
  }
  return {
    semantic: {
      primary: primaryPalette(theme.preset, theme.primary),
      colorScheme: {
        light: {
          primary: { color: '{primary.500}', contrastColor: '#ffffff', hoverColor: '{primary.600}', activeColor: '{primary.700}' },
          highlight: { background: '{primary.50}', focusBackground: '{primary.100}', color: '{primary.700}', focusColor: '{primary.800}' },
        },
        dark: {
          primary: { color: '{primary.400}', contrastColor: '{surface.900}', hoverColor: '{primary.300}', activeColor: '{primary.200}' },
          highlight: {
            background: 'color-mix(in srgb, {primary.400}, transparent 84%)',
            focusBackground: 'color-mix(in srgb, {primary.400}, transparent 76%)',
            color: 'rgba(255,255,255,.87)',
            focusColor: 'rgba(255,255,255,.87)',
          },
        },
      },
    },
  }
}
