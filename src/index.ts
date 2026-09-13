// @meddleware/seal-client — modular Seal encryption for Sui.
//
// The on-chain half is the `seal_policies` Move package (repos/seal-policies-sui). Each policy is
// a provider here mirrored 1:1 with a Move module; the registry is the extension seam.

export type { FieldSpec, PolicyDescriptor, SealPolicyProvider, SealedManifest, FieldSuggestion, SealSuggestClient, SuggestContext } from './types.js'
export * from './bytes.js'
export { PolicyRegistry } from './registry.js'
export { createDefaultRegistry } from './default-registry.js'
export {
  SealController,
  type SealControllerConfig,
  type KeyServerConfig,
  type SignPersonalMessage,
  type EncryptResult,
} from './controller.js'
export { createNftGateProvider, nftGateProvider, type NftGateParams } from './providers/nft-gate.js'
export { timeLockProvider, type TimeLockParams } from './providers/timelock.js'
export {
  buildPublishSealedContentTx,
  sealedContentEventType,
  type SealedContentInput,
  type SealedContentPointer,
} from './sealed-content.js'
