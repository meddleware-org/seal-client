// The SealedManifest is the interchange format between encrypt and decrypt (CLAUDE.md invariant).
// This guard is the single place the shape is validated, so every consumer (seal-ui and any other
// app) rejects malformed manifests the same way rather than each re-implementing an ad-hoc check.

import type { PolicyRegistry } from './registry.js'
import type { SealedManifest } from './types.js'

/** Thrown when a value cannot be parsed as a `SealedManifest`. */
export class SealedManifestError extends Error {
  constructor(message: string) {
    super(`invalid sealed manifest: ${message}`)
    this.name = 'SealedManifestError'
  }
}

function requireNonEmptyString(o: Record<string, unknown>, key: string): string {
  const v = o[key]
  if (typeof v !== 'string' || v.length === 0) {
    throw new SealedManifestError(`\`${key}\` must be a non-empty string`)
  }
  return v
}

function requireIdentityHex(o: Record<string, unknown>): string {
  const id = requireNonEmptyString(o, 'id')
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(id)) {
    throw new SealedManifestError('`id` must be even-length hex (the Seal identity, without 0x)')
  }
  return id
}

/**
 * Parse and validate an untrusted value as a {@link SealedManifest}. Accepts either a JSON string
 * or an already-parsed object. Throws {@link SealedManifestError} on any malformed input — a
 * missing/empty required field (`policyType`, `id`, `blobId`, `network`), a non-object `params`,
 * or a non-string `label`. On success the returned object contains only the known manifest fields.
 *
 * `id` must be even-length hex (the Seal identity, persisted verbatim). With a `registry`, `policyType` must be
 * registered there and the provider's `parseParams` (when it has one) validates and narrows `params`, so a
 * malformed manifest fails here with a clear error instead of at PTB build time.
 *
 * This does NOT check that `network` matches the app's current network — that is an
 * application-level policy the caller enforces after parsing (see seal-ui).
 */
export function parseSealedManifest(raw: unknown, registry?: PolicyRegistry): SealedManifest {
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      throw new SealedManifestError('not valid JSON')
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SealedManifestError('not an object')
  }
  const o = value as Record<string, unknown>

  const manifest: SealedManifest = {
    policyType: requireNonEmptyString(o, 'policyType'),
    id: requireIdentityHex(o),
    blobId: requireNonEmptyString(o, 'blobId'),
    network: requireNonEmptyString(o, 'network'),
  }

  if (o.params !== undefined) {
    if (!o.params || typeof o.params !== 'object' || Array.isArray(o.params)) {
      throw new SealedManifestError('`params` must be an object when present')
    }
    manifest.params = o.params as Record<string, unknown>
  }
  if (o.label !== undefined) {
    if (typeof o.label !== 'string') {
      throw new SealedManifestError('`label` must be a string when present')
    }
    manifest.label = o.label
  }

  if (registry) {
    if (!registry.has(manifest.policyType)) {
      throw new SealedManifestError(`unknown policy type "${manifest.policyType}"`)
    }
    const provider = registry.get(manifest.policyType)
    if (provider.parseParams) {
      try {
        manifest.params = provider.parseParams(manifest.params) as unknown as Record<string, unknown>
      } catch (e) {
        throw new SealedManifestError(e instanceof Error ? e.message : String(e))
      }
    }
  }

  return manifest
}
