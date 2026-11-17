import { Injectable, signal, OnDestroy } from '@angular/core'

/** Breakpoints matching tailwind.css @theme */
const BP = {
  sm: '(min-width: 576px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 992px)',
  xl: '(min-width: 1200px)',
  xxl: '(min-width: 1920px)',
} as const

@Injectable({ providedIn: 'root' })
export class BreakpointService implements OnDestroy {
  readonly isSm = signal(false)
  readonly isMd = signal(false)
  readonly isLg = signal(false)
  readonly isXl = signal(false)
  readonly isXxl = signal(false)

  private readonly queries: {
    mq: MediaQueryList
    handler: (e: MediaQueryListEvent) => void
  }[] = []

  constructor() {
    this.register('sm', this.isSm)
    this.register('md', this.isMd)
    this.register('lg', this.isLg)
    this.register('xl', this.isXl)
    this.register('xxl', this.isXxl)
  }

  private register(
    key: keyof typeof BP,
    sig: ReturnType<typeof signal<boolean>>
  ) {
    const mq = globalThis.matchMedia(BP[key])
    sig.set(mq.matches)
    const handler = (e: MediaQueryListEvent) => sig.set(e.matches)
    mq.addEventListener('change', handler)
    this.queries.push({ mq, handler })
  }

  ngOnDestroy(): void {
    this.queries.forEach(({ mq, handler }) =>
      mq.removeEventListener('change', handler)
    )
  }
}
