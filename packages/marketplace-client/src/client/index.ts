import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import marketplaceRemote from '@deepseek-ai/dsh-desktop-marketplace-host/remote'
import type { MarketplaceOperation, MarketplaceSnapshot } from '@deepseek-ai/dsh-desktop-marketplace-host/types'
import {
  MarketplaceSettingsTab,
  type MarketplaceSettingsTabInjected,
} from './MarketplaceSettingsTab.tsx'
import { en, zh, type MarketplaceLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.marketplace': MarketplaceLocaleKey
  }
}

export const NS = 'settings.marketplace'
export const inject = ['slots', 'locale', 'remote']

interface MarketplaceRemote {
  catalog: () => Promise<{ ok: true; value: MarketplaceSnapshot } | { ok: false; error: { code: string; message: string } }>
  mutate: (request: Parameters<MarketplaceSettingsTabInjected['mutate']>[0]) => Promise<
    { ok: true; value: MarketplaceOperation } | { ok: false; error: { code: string; message: string } }
  >
  operation: (id: string) => Promise<
    { ok: true; value: MarketplaceOperation } | { ok: false; error: { code: string; message: string } }
  >
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(marketplaceRemote)
  const remote = ctx.get('remote.marketplace') as MarketplaceRemote | undefined
  if (remote === undefined) {
    await disposeRemote()
    throw new Error('Marketplace Remote namespace did not start')
  }
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'desktop-marketplace: dictionaries')
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
  return disposeRemote
}
