import { MenuItem } from 'primeng/api'

export const APP_PREFERENCES_USERACCOUNT_URL = '/app/preferences/useraccount'

export const APP_MENU: any[] = [
  {
    label: 'demo_components',
    icon: 'pi pi-palette',
    path: '/demo',
    items: [
      {
        label: 'demo',
        icon: 'pi pi-desktop',
        routerLink: ['/app/pages/demo'],
        path: '/demo/showcase',
      },
    ],
  },
  {
    label: 'home',
    icon: 'pi pi-home',
    path: '/home',
    items: [
      {
        label: 'dashboard',
        icon: 'pi pi-chart-bar',
        routerLink: ['/app'],
        path: '/home/dashboard',
      },
      {
        label: 'reports',
        icon: 'pi pi-file',
        routerLink: ['/app/reports'],
        path: '/home/reports',
      },
    ],
  },
  {
    label: 'inbound',
    icon: 'pi pi-arrow-circle-down',
    path: '/inbound',
    items: [
      {
        label: 'receivings',
        icon: 'pi pi-sign-in',
        routerLink: ['/app/inbound/receivings'],
        path: '/inbound/receivings',
      },
      {
        label: 'archived inbound',
        icon: 'pi pi-server',
        routerLink: ['/app/inbound/archived'],
        path: '/inbound/archived',
      },
      {
        label: 'upload logs',
        icon: 'pi pi-history',
        routerLink: ['/app/inbound/receivings/upload-logs'],
        path: '/inbound/receivings/upload-logs',
      },
    ],
  },
  {
    label: 'inventory',
    icon: 'pi pi-database',
    path: '/inventory',
    items: [
      {
        label: 'tracecards',
        icon: 'pi pi-home',
        routerLink: ['/app/inventory/tracecards'],
        path: '/inventory/tracecards',
      },
      {
        label: 'catalog',
        icon: 'pi pi-sitemap',
        routerLink: ['/app/inventory/catalog'],
        path: '/inventory/catalog',
      },
      {
        label: 'upload logs',
        icon: 'pi pi-history',
        routerLink: ['/app/inventory/catalog/upload-logs'],
        path: '/inventory/catalog/upload-logs',
      },
    ],
  },
  {
    label: 'outbound',
    icon: 'pi pi-arrow-circle-up',
    path: '/outbound',
    items: [
      {
        label: 'all orders',
        icon: 'pi pi-list',
        routerLink: ['/app/outbound/allorders'],
        path: '/outbound/allorders',
      },
      {
        label: 'backorders',
        icon: 'pi pi-list',
        routerLink: ['/app/outbound/backorders'],
        path: '/outbound/backorders',
      },
      {
        label: 'processing',
        icon: 'pi pi-spinner',
        routerLink: ['/app/outbound/processing'],
        path: '/outbound/processing',
      },
      {
        label: 'archived outbound',
        icon: 'pi pi-server',
        routerLink: ['/app/outbound/archived'],
        path: '/outbound/archived',
      },
    ],
  },
  {
    label: 'parcels',
    icon: 'pi pi-arrow-circle-up',
    path: '/parcels',
    items: [
      {
        label: 'all parcels',
        icon: 'pi pi-box',
        routerLink: ['/app/parcels'],
        path: '/parcels/allparcels',
      },
      {
        label: 'upload logs',
        icon: 'pi pi-history',
        routerLink: ['/app/parcels/upload-logs'],
        path: '/parcels/upload-logs',
      },
    ],
  },
]

/** Top-bar shortcut: translation key, PrimeIcons class and absolute route. */
const topbarLink = (label: string, icon: string, route: string): MenuItem => ({
  label,
  icon,
  routerLink: [route],
})

export const APP_MENU_TOPBAR: MenuItem[] = [
  topbarLink('marketplace', 'pi pi-th-large', '/app/marketplace'),
  topbarLink('users', 'pi pi-user', '/app/preferences/useraccount'),
  topbarLink('roles', 'pi pi-users', '/app/preferences/permissions'),
  topbarLink('packaging', 'pi pi-box', '/app/preferences/packaging'),
  topbarLink(
    'Locations & Bins',
    'pi pi-warehouse',
    '/app/preferences/locations'
  ),
  topbarLink(
    'fulfillment locations',
    'pi pi-sliders-h',
    '/app/preferences/facilities'
  ),
  topbarLink('rotations', 'pi pi-sync', '/app/preferences/rotations'),
  topbarLink('integrations', 'pi pi-globe', '/app/preferences/integrations'),
]
