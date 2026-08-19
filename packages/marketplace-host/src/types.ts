export type MarketplaceOperationAction = 'install' | 'update' | 'uninstall'
export type MarketplaceOperationPhase =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'staging'
  | 'installing'
  | 'validating'
  | 'ready-to-restart'
  | 'restarting'
  | 'completed'
  | 'failed'
  | 'rolled-back'

export interface MarketplacePlugin {
  id: string
  name: string
  description: string
  publisher: string
  packageName: string
  repositoryURL: string
  version: string
  installedVersion: string | null
  compatible: boolean
  verified: boolean
  permissions: string[]
  license: string
}

export interface MarketplaceSnapshot {
  plugins: MarketplacePlugin[]
  catalogVerified: boolean
  generatedAt: string
  warning: string | null
}

export interface MarketplaceOperation {
  id: string
  pluginId: string
  action: MarketplaceOperationAction
  phase: MarketplaceOperationPhase
  progress: number
  message: string
  error: string | null
}

export interface MarketplaceMutationRequest {
  pluginId: string
  action: MarketplaceOperationAction
}
