import { EncryptedObject, SealClient, SessionKey } from '@mysten/seal'
import type { SealCompatibleClient } from '@mysten/seal'
import { Transaction } from '@mysten/sui/transactions'
import type { PolicyRegistry } from './registry.js'
import { bytesToHex, hexToBytes } from './bytes.js'

/** One key server in the threshold committee. */
export interface KeyServerConfig {
  /** On-chain key server object id. */
  objectId: string
  /** Contribution toward the threshold (default 1). */
  weight?: number
  /** Aggregator URL — required for committee-mode key servers (all fetch-key calls proxy it). */
  aggregatorUrl?: string
  /** API-key header name for an authenticated server/aggregator (e.g. `X-API-Key`). */
  apiKeyName?: string
  /** API key for an authenticated server/aggregator (a publishable client key — it ships to browsers). */
  apiKey?: string
}

export interface SealControllerConfig {
  /** A Sui client exposing the core API (e.g. `SuiGrpcClient` from `@mysten/sui/grpc`). */
  suiClient: SealCompatibleClient
  /**
   * The `seal_policies` package's **original id**: the Seal identity namespace (encrypt, the
   * ciphertext check) and the SessionKey scope. It never changes across upgrades.
   */
  originalId: string
  /** The package's latest **published-at** id: the call target of the `seal_approve*` PTB. */
  publishedAt: string
  /** Committee of key servers: encryption targets all; decryption needs `threshold` of them. */
  serverConfigs: KeyServerConfig[]
  /** `t` in t-of-n. With a 3-server committee, 2 tolerates any one server being offline. */
  threshold: number
  /** SessionKey time-to-live in minutes (default 10). */
  sessionTtlMin?: number
  /**
   * Verify each key server's URL against its on-chain object before use (prevents a look-alike
   * server object pointing at a known URL). Defaults to `true` unless any server is reached through
   * an aggregator (committee mode), where per-server verification does not apply.
   */
  verifyKeyServers?: boolean
  /**
   * Check that key shares from different servers are consistent before combining them (default
   * `true`, recommended by Seal for sensitive data).
   */
  checkShareConsistency?: boolean
}

/** Wallet hook: sign a personal message, returning the signature (base64). */
export type SignPersonalMessage = (message: Uint8Array) => Promise<{ signature: string }>

export interface EncryptResult {
  /** Seal identity (hex, no `0x`) — persist this in the manifest; required verbatim to decrypt. */
  id: string
  /** The encrypted object bytes to store (e.g. upload to Walrus). */
  ciphertext: Uint8Array
}

/**
 * Orchestrates Seal threshold encrypt/decrypt over a policy registry, and manages the per-address
 * SessionKey (signed once, cached until it expires). No policy logic lives here — that is entirely
 * in the registered providers, so new policy types need no controller changes.
 */
export class SealController {
  private readonly client: SealClient
  private readonly sessions = new Map<string, { key: SessionKey; expiresAt: number }>()

  constructor(
    private readonly cfg: SealControllerConfig,
    private readonly registry: PolicyRegistry,
  ) {
    const ttl = cfg.sessionTtlMin ?? 10
    if (ttl < 2) {
      throw new Error(
        `sessionTtlMin must be ≥ 2 (got ${ttl}); a shorter TTL leaves no window before the early-expiry guard fires`,
      )
    }
    this.client = new SealClient({
      suiClient: cfg.suiClient,
      serverConfigs: cfg.serverConfigs.map((s) => ({
        objectId: s.objectId,
        weight: s.weight ?? 1,
        aggregatorUrl: s.aggregatorUrl,
        ...(s.apiKey ? { apiKeyName: s.apiKeyName ?? 'X-API-Key', apiKey: s.apiKey } : {}),
      })),
      verifyKeyServers: cfg.verifyKeyServers ?? !cfg.serverConfigs.some((s) => s.aggregatorUrl),
    })
    const totalWeight = cfg.serverConfigs.reduce((n, s) => n + (s.weight ?? 1), 0)
    if (!Number.isInteger(cfg.threshold) || cfg.threshold < 1 || cfg.threshold > totalWeight) {
      throw new Error(
        `threshold must be an integer in [1, ${totalWeight}] (the total server weight); got ${cfg.threshold}`,
      )
    }
  }

  /** Encrypt `data` under policy `type` with `params`. Returns the identity (hex) + ciphertext. */
  async encrypt<P>(type: string, params: P, data: Uint8Array): Promise<EncryptResult> {
    const provider = this.registry.get<P>(type)
    const id = bytesToHex(provider.buildId(params))
    const { encryptedObject } = await this.client.encrypt({
      threshold: this.cfg.threshold,
      packageId: this.cfg.originalId,
      id,
      data,
    })
    return { id, ciphertext: encryptedObject }
  }

  /**
   * Decrypt `ciphertext` sealed under policy `type` with identity `id` (hex, from the manifest).
   * `params` supplies the on-chain objects the policy's `seal_approve` needs. Prompts a single
   * wallet personal-message signature per address to mint a SessionKey (cached until expiry).
   */
  async decrypt<P>(
    type: string,
    params: P,
    id: string,
    ciphertext: Uint8Array,
    opts: { address: string; signPersonalMessage: SignPersonalMessage },
  ): Promise<Uint8Array> {
    const provider = this.registry.get<P>(type)
    if (id.length % 2 !== 0) throw new Error(`malformed Seal id (odd hex length): ${id}`)
    const idBytes = hexToBytes(id)
    // Defense-in-depth: verify stored id is consistent with the supplied params.
    provider.verifyId?.(idBytes, params)
    // The ciphertext itself names the identity and namespace it was sealed to; refuse to request
    // keys for a different identity than the one the caller expects (a swapped ciphertext or a
    // tampered manifest would otherwise ask the servers for the wrong key).
    const sealed = EncryptedObject.parse(ciphertext)
    if (sealed.id.toLowerCase().replace(/^0x/, '') !== id.toLowerCase()) {
      throw new Error('seal-client: ciphertext identity does not match the expected Seal id')
    }
    if (normalizeHexId(sealed.packageId) !== normalizeHexId(this.cfg.originalId)) {
      throw new Error('seal-client: ciphertext was sealed under a different policy package')
    }
    const sessionKey = await this.session(opts.address, opts.signPersonalMessage)

    const tx = new Transaction()
    provider.buildApprove(tx, this.cfg.publishedAt, idBytes, params)
    const txBytes = await tx.build({ client: this.cfg.suiClient, onlyTransactionKind: true })

    return this.client.decrypt({
      data: ciphertext,
      sessionKey,
      txBytes,
      checkShareConsistency: this.cfg.checkShareConsistency ?? true,
    })
  }

  /**
   * Drop cached SessionKey(s). Call this on wallet disconnect or account change so a key minted
   * for a previous address is never reused after reconnect — a reused session would sign key-server
   * requests under a stale identity. With no argument, clears every cached session; with an
   * address, clears just that one.
   */
  clearSession(address?: string): void {
    if (address === undefined) this.sessions.clear()
    else this.sessions.delete(this.sessionKeyId(address))
  }

  /** Sessions are scoped to the address AND the policy package they authorise. */
  private sessionKeyId(address: string): string {
    return `${address.toLowerCase()}:${normalizeHexId(this.cfg.originalId)}`
  }

  private async session(address: string, sign: SignPersonalMessage): Promise<SessionKey> {
    const cached = this.sessions.get(this.sessionKeyId(address))
    if (cached && cached.expiresAt > Date.now()) return cached.key

    const ttlMin = this.cfg.sessionTtlMin ?? 10
    const key = await SessionKey.create({
      address,
      packageId: this.cfg.originalId,
      ttlMin,
      suiClient: this.cfg.suiClient,
    })
    const { signature } = await sign(key.getPersonalMessage())
    await key.setPersonalMessageSignature(signature)
    // Expire a minute early so we never hand a just-expired key to a key server.
    this.sessions.set(this.sessionKeyId(address), {
      key,
      expiresAt: Date.now() + (ttlMin - 1) * 60_000,
    })
    return key
  }
}

/** Lower-case, `0x`-prefixed, zero-padded 32-byte hex id for comparisons. */
function normalizeHexId(v: string): string {
  const hex = v.toLowerCase().replace(/^0x/, '')
  return `0x${hex.padStart(64, '0')}`
}
