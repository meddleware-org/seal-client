import { SealClient, SessionKey } from '@mysten/seal'
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
}

export interface SealControllerConfig {
  /** A Sui client exposing the core API (e.g. `SuiGrpcClient` from `@mysten/sui/grpc`). */
  suiClient: SealCompatibleClient
  /** Published `seal_policies` package id (feeds encrypt, SessionKey, and the approve PTB). */
  packageId: string
  /** Committee of key servers: encryption targets all; decryption needs `threshold` of them. */
  serverConfigs: KeyServerConfig[]
  /** `t` in t-of-n. With a 3-server committee, 2 tolerates any one server being offline. */
  threshold: number
  /** SessionKey time-to-live in minutes (default 10). */
  sessionTtlMin?: number
  /** Verify key server object ids on-chain (default false; committee mode is testnet-only). */
  verifyKeyServers?: boolean
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
      })),
      verifyKeyServers: cfg.verifyKeyServers ?? false,
    })
  }

  /** Encrypt `data` under policy `type` with `params`. Returns the identity (hex) + ciphertext. */
  async encrypt<P>(type: string, params: P, data: Uint8Array): Promise<EncryptResult> {
    const provider = this.registry.get<P>(type)
    const id = bytesToHex(provider.buildId(params))
    const { encryptedObject } = await this.client.encrypt({
      threshold: this.cfg.threshold,
      packageId: this.cfg.packageId,
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
    const sessionKey = await this.session(opts.address, opts.signPersonalMessage)

    const tx = new Transaction()
    provider.buildApprove(tx, this.cfg.packageId, idBytes, params)
    const txBytes = await tx.build({ client: this.cfg.suiClient, onlyTransactionKind: true })

    return this.client.decrypt({ data: ciphertext, sessionKey, txBytes })
  }

  /**
   * Drop cached SessionKey(s). Call this on wallet disconnect or account change so a key minted
   * for a previous address is never reused after reconnect — a reused session would sign key-server
   * requests under a stale identity. With no argument, clears every cached session; with an
   * address, clears just that one.
   */
  clearSession(address?: string): void {
    if (address === undefined) this.sessions.clear()
    else this.sessions.delete(address)
  }

  private async session(address: string, sign: SignPersonalMessage): Promise<SessionKey> {
    const cached = this.sessions.get(address)
    if (cached && cached.expiresAt > Date.now()) return cached.key

    const ttlMin = this.cfg.sessionTtlMin ?? 10
    const key = await SessionKey.create({
      address,
      packageId: this.cfg.packageId,
      ttlMin,
      suiClient: this.cfg.suiClient,
    })
    const { signature } = await sign(key.getPersonalMessage())
    await key.setPersonalMessageSignature(signature)
    // Expire a minute early so we never hand a just-expired key to a key server.
    this.sessions.set(address, { key, expiresAt: Date.now() + (ttlMin - 1) * 60_000 })
    return key
  }
}
