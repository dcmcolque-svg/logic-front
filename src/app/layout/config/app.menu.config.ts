import { MenuItem } from 'primeng/api'

export const APP_PREFERENCES_USERACCOUNT_URL = '/app/preferences/useraccount'

/**
 * Sidebar, in the order the business uses it: home, sales, inventory, inbound,
 * outbound. The order also picks the landing page after login
 * (AuthService.getFirstAvailableRoute: the first entry the user may open).
 */
export const APP_MENU: any[] = [
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
      // Temporarily hidden: Reports
      // {
      //   label: 'reports',
      //   icon: 'pi pi-file',
      //   routerLink: ['/app/reports'],
      //   path: '/home/reports',
      // },
    ],
  },
  {
    // Activities "Point of Sale", "Sales History", "Customers", "Payment Methods" (sales module)
    label: 'sales',
    icon: 'pi pi-shop',
    path: '/sales',
    items: [
      {
        label: 'point of sale',
        icon: 'pi pi-shopping-cart',
        routerLink: ['/app/sales/pos'],
        path: '/sales/pos',
      },
      {
        label: 'sales history',
        icon: 'pi pi-receipt',
        routerLink: ['/app/sales/history'],
        path: '/sales/history',
      },
      {
        label: 'customers',
        icon: 'pi pi-users',
        routerLink: ['/app/sales/customers'],
        path: '/sales/customers',
      },
      {
        label: 'payment methods',
        icon: 'pi pi-credit-card',
        routerLink: ['/app/sales/payment-methods'],
        path: '/sales/payment-methods',
      },
    ],
  },
  {
    label: 'inventory',
    icon: 'pi pi-box',
    path: '/inventory',
    items: [
      {
        label: 'tracecards',
        // label is the permission activity; i18nKey only changes the text shown
        i18nKey: 'inventory',
        icon: 'pi pi-id-card',
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
        // Activity "Valuation" — OWNER only (costing phase 5)
        label: 'valuation',
        icon: 'pi pi-wallet',
        routerLink: ['/app/inventory/valuation'],
        path: '/inventory/valuation',
      },
      {
        label: 'upload logs',
        // label is the permission activity; i18nKey only changes the text shown
        i18nKey: 'catalog_upload_logs',
        icon: 'pi pi-history',
        routerLink: ['/app/inventory/catalog/upload-logs'],
        path: '/inventory/catalog/upload-logs',
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
        icon: 'pi pi-inbox',
        routerLink: ['/app/inbound/receivings'],
        path: '/inbound/receivings',
      },
      {
        // Activity "Suppliers"
        label: 'suppliers',
        icon: 'pi pi-truck',
        routerLink: ['/app/inbound/suppliers'],
        path: '/inbound/suppliers',
      },
      // {
      //   label: 'archived inbound',
      //   icon: 'pi pi-server',
      //   routerLink: ['/app/inbound/archived'],
      //   path: '/inbound/archived',
      // },
      {
        label: 'upload logs',
        i18nKey: 'receiving_upload_logs',
        icon: 'pi pi-history',
        routerLink: ['/app/inbound/receivings/upload-logs'],
        path: '/inbound/receivings/upload-logs',
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
        icon: 'pi pi-hourglass',
        routerLink: ['/app/outbound/backorders'],
        path: '/outbound/backorders',
      },
      {
        label: 'processing',
        icon: 'pi pi-cog',
        routerLink: ['/app/outbound/processing'],
        path: '/outbound/processing',
      },
      // {
      //   label: 'archived outbound',
      //   icon: 'pi pi-server',
      //   routerLink: ['/app/outbound/archived'],
      //   path: '/outbound/archived',
      // },
    ],
  },
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
  // TEMPORARILY HIDDEN: parcels menu
  //   {
  //     label: 'parcels',
  //     icon: 'pi pi-arrow-circle-up',
  //     path: '/parcels',
  //     items: [
  //       {
  //         label: 'all parcels',
  //         icon: 'pi pi-box',
  //         routerLink: ['/app/parcels'],
  //         path: '/parcels/allparcels',
  //       },
  //       {
  //         label: 'upload logs',
  //         icon: 'pi pi-history',
  //         routerLink: ['/app/parcels/upload-logs'],
  //         path: '/parcels/upload-logs',
  //       },
  //     ],
  //   },
]

/** Top-bar shortcut: translation key, PrimeIcons class and absolute route. */
const topbarLink = (label: string, icon: string, route: string): MenuItem => ({
  label,
  icon,
  routerLink: [route],
})

export const APP_MENU_TOPBAR: MenuItem[] = [
  topbarLink('users', 'pi pi-user', '/app/preferences/useraccount'),
  // Activity "Companies" — OWNER only: the operator's companies (inventory owners)
  topbarLink('companies', 'pi pi-building', '/app/preferences/companies'),
  topbarLink(
    'fulfillment locations',
    'pi pi-sliders-h',
    '/app/preferences/facilities'
  ),
  topbarLink('packaging', 'pi pi-box', '/app/preferences/packaging'),
  topbarLink(
    'Locations & Bins',
    'pi pi-warehouse',
    '/app/preferences/locations'
  ),
  // Activity "Appearance" — OWNER only: the company's colors and menu type
  topbarLink('appearance', 'pi pi-palette', '/app/preferences/appearance'),
  // Temporarily hidden: Rotations & Integrations
  // topbarLink('rotations', 'pi pi-sync', '/app/preferences/rotations'),
  // topbarLink('integrations', 'pi pi-globe', '/app/preferences/integrations'),
]
