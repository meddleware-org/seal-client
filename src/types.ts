import type { Transaction } from '@mysten/sui/transactions'

/** A suggested value for a policy form field, sourced from chain state. */
export interface FieldSuggestion {
  value: string
  label: string
}

/**
 * Minimal structural subset of a Sui gRPC core client needed by `suggest`.
 * Compatible with `SuiGrpcClient.core` from `@mysten/sui/grpc` without importing it directly.
 */
export interface SealSuggestClient {
  core: {
    listOwnedObjects(options: {
      owner: string
      type?: string
      cursor?: string | null
      limit?: number
      include?: { json?: boolean }
    }): Promise<{
      objects: Array<{ objectId: string; type?: string; json?: Record<string, unknown> | null }>
      hasNextPage: boolean
      cursor: string | null
    }>
    getObject(options: {
      objectId: string
      include?: { json?: boolean }
    }): Promise<{ object: { objectId: string; type?: string; json?: Record<string, unknown> | null } }>
  }
}

/** Context passed to a provider's `suggest` method. */
export interface SuggestContext {
  /** The connected wallet address. */
  account: string
  /** Sui gRPC client (structural — any compatible client is accepted). */
  client: SealSuggestClient
}

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

  /**
   * Optional defense-in-depth: verify that `idBytes` (from the stored manifest) is consistent
   * with `params` (supplied at decrypt time). Throw an `Error` on mismatch — indicates a
   * corrupted manifest or a caller supplying params for a different ciphertext.
   * Called by `SealController.decrypt` before building the approve PTB.
   */
  verifyId?(idBytes: Uint8Array, params: P): void

  /**
   * Optional: suggest values for form fields by querying chain state (e.g. objects owned by the
   * connected wallet). Returns a map of `fieldName → suggestions[]`. Only fields with non-empty
   * suggestion arrays need be included. The UI renders a picker for those fields and falls back
   * to a plain text input when no suggestions are available or the user opts out.
   */
  suggest?(context: SuggestContext): Promise<Partial<Record<string, FieldSuggestion[]>>>
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
