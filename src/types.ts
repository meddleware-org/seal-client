import type { Transaction } from '@mysten/sui/transactions'

/** A single input field a policy needs, used to render encrypt/decrypt forms generically. */
export interface FieldSpec {
  /** Key in the provider's params object. */
  name: string
  /** Human label for the form. */
  label: string
  /** Rendering/validation hint. */
  kind: 'text' | 'objectId' | 'datetime' | 'boolean'
  required: boolean
  help?: string
}

/** UI-facing description of a policy: label + which fields encrypt vs decrypt need. */
export interface PolicyDescriptor {
  type: string
  label: string
  help: string
  /** Fields required to ENCRYPT under this policy (feed `buildId`). */
  encryptFields: FieldSpec[]
  /** Fields required to DECRYPT (feed `buildApprove`), in addition to the stored identity. */
  decryptFields: FieldSpec[]
}

/**
 * A Seal access policy, mirrored 1:1 with a `seal_policies` Move module. Providers are peers —
 * none is privileged. Adding a policy type is a new provider here + a new Move module; existing
 * code is untouched.
 */
export interface SealPolicyProvider<P = Record<string, unknown>> {
  /** Stable machine id, e.g. 'nft-gate' | 'time-lock'. */
  readonly type: string

  /**
   * Build the Seal identity bytes for a new ciphertext (namespace prefix + a random nonce).
   * Called once at encrypt time; the result is persisted in the manifest and reused verbatim
   * to decrypt.
   */
  buildId(params: P): Uint8Array

  /**
   * Append the `seal_approve*` move call (target + the identity as the first arg + policy
   * objects) to `tx`. Called at decrypt time to produce the PTB the key servers dry-run.
   */
  buildApprove(tx: Transaction, packageId: string, idBytes: Uint8Array, params: P): void

  /** Form/rendering metadata (drives a generic, registry-driven UI). */
  describe(): PolicyDescriptor
}

/** Portable pointer to one sealed blob — the interchange format between encrypt and decrypt. */
export interface SealedManifest {
  /** Policy `type` used to seal this content. */
  policyType: string
  /** Seal identity (hex, no 0x) produced by `buildId` — required to decrypt. */
  id: string
  /** Storage pointer to the ciphertext (e.g. a Walrus blob id). */
  blobId: string
  /** Network the policy package + key servers live on. */
  network: string
  /** Non-secret policy params needed to rebuild the approve PTB (e.g. gateId). */
  params?: Record<string, unknown>
  /** Optional human label. */
  label?: string
}
