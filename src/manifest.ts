// The SealedManifest is the interchange format between encrypt and decrypt (CLAUDE.md invariant).
// This guard is the single place the shape is validated, so every consumer (seal-ui and any other
// app) rejects malformed manifests the same way rather than each re-implementing an ad-hoc check.

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

/**
 * Parse and validate an untrusted value as a {@link SealedManifest}. Accepts either a JSON string
 * or an already-parsed object. Throws {@link SealedManifestError} on any malformed input — a
 * missing/empty required field (`policyType`, `id`, `blobId`, `network`), a non-object `params`,
 * or a non-string `label`. On success the returned object contains only the known manifest fields.
 *
 * This does NOT check that `network` matches the app's current network — that is an
 * application-level policy the caller enforces after parsing (see seal-ui).
 */
export function parseSealedManifest(raw: unknown): SealedManifest {
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
    id: requireNonEmptyString(o, 'id'),
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

  return manifest
}
