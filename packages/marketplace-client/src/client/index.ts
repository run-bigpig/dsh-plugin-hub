import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import desktopRemote from '@run-bigpig/dsh-desktop-marketplace-host/remote'
import type {
  DesktopCapabilities,
  DesktopWindowState,
  MarketplaceOperation,
  MarketplaceSnapshot,
} from '@run-bigpig/dsh-desktop-marketplace-host/types'
import {
  MarketplaceSettingsTab,
  type MarketplaceSettingsTabInjected,
} from './MarketplaceSettingsTab.tsx'
import {
  DesktopWindowControls,
  type DesktopWindowControlsInjected,
} from './DesktopWindowControls.tsx'
import { desktopEn, desktopZh, en, zh, type DesktopLocaleKey, type MarketplaceLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.marketplace': MarketplaceLocaleKey
    'desktop.integration': DesktopLocaleKey
  }
}

export const NS = 'settings.marketplace'
export const DESKTOP_NS = 'desktop.integration'
export const inject = ['slots', 'locale', 'remote']

interface DesktopRemote {
  capabilities: () => Promise<RemoteResult<DesktopCapabilities>>
  windowState: () => Promise<RemoteResult<DesktopWindowState>>
  minimizeWindow: () => Promise<RemoteResult<void>>
  toggleMaximizeWindow: () => Promise<RemoteResult<DesktopWindowState>>
  closeWindow: () => Promise<RemoteResult<void>>
  catalog: () => Promise<{ ok: true; value: MarketplaceSnapshot } | { ok: false; error: { code: string; message: string } }>
  mutate: (request: Parameters<MarketplaceSettingsTabInjected['mutate']>[0]) => Promise<
    { ok: true; value: MarketplaceOperation } | { ok: false; error: { code: string; message: string } }
  >
  operation: (id: string) => Promise<
    { ok: true; value: MarketplaceOperation } | { ok: false; error: { code: string; message: string } }
  >
}

type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

const CAPABILITY_RETRY_DELAYS_MS = [0, 50, 100, 200, 400, 800]

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

async function discoverCapabilities(remote: DesktopRemote): Promise<DesktopCapabilities> {
  let lastError: Error | undefined
  for (const delay of CAPABILITY_RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
    const result = await remote.capabilities()
    if (result.ok) return result.value
    lastError = new Error(`${result.error.code}: ${result.error.message}`)
  }
  throw lastError ?? new Error('Desktop capabilities are unavailable')
}

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(desktopRemote)
  const remote = ctx.get('remote.desktop') as DesktopRemote | undefined
  if (remote === undefined) {
    await disposeRemote()
    throw new Error('Desktop Remote namespace did not start')
  }
  let capabilities: DesktopCapabilities
  try {
    capabilities = await discoverCapabilities(remote)
  } catch {
    await disposeRemote()
    return async () => {}
  }
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'desktop-marketplace: dictionaries')
  ctx.effect(() => ctx.locale.register(DESKTOP_NS, { zh: desktopZh, en: desktopEn }), 'desktop-integration: dictionaries')
  if (capabilities.apiVersion === 1 && capabilities.capabilities.includes('marketplace')) {
    const t = ctx.locale.bind(NS)
    const injected: MarketplaceSettingsTabInjected = {
      catalog: async (): Promise<MarketplaceSnapshot> => unwrap(await remote.catalog()),
      mutate: async request => unwrap(await remote.mutate(request)),
      operation: async (id: string): Promise<MarketplaceOperation> => unwrap(await remote.operation(id)),
    }
    ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
      name: 'settings.plugins.tab',
      id: 'market',
      order: 5,
      label: () => t('tab'),
      locale: NS,
      inject: () => injected,
    }, MarketplaceSettingsTab))
  }
  if (capabilities.apiVersion === 1 && capabilities.capabilities.includes('window.controls')) {
    const windowActions: DesktopWindowControlsInjected = {
      windowState: async () => unwrap(await remote.windowState()),
      minimizeWindow: async () => { unwrap(await remote.minimizeWindow()) },
      toggleMaximizeWindow: async () => unwrap(await remote.toggleMaximizeWindow()),
      closeWindow: async () => { unwrap(await remote.closeWindow()) },
    }
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'desktop-window-controls',
      order: -100,
      locale: DESKTOP_NS,
      inject: () => windowActions,
    }, DesktopWindowControls))
  }
  return disposeRemote
}
