/**
 * Maintainer-run live round trip of the `nft-gate` policy against the public TESTNET Seal key servers,
 * with the negatives (sealed-storage lens C.2): wrong gate, non-owner, exhausted pass, paused gate, a
 * time-lock that is still locked, and the frozen-transferable-pass outcome (sealed-storage-sui F16).
 *
 * It spends testnet SUI, so it is NOT part of the weekly CI job (a funded key must never be a CI secret). It
 * skips unless BOTH are set:
 *
 *   SEAL_TESTNET=1
 *   SEAL_LIVE_KEY_FILE=<path to a file holding one `suiprivkey…` testnet key with ≥ 0.15 SUI>
 *
 *   SEAL_TESTNET=1 SEAL_LIVE_KEY_FILE=~/.local/state/meddleware/paywall-runner/key \
 *     npx vitest run --config vitest.integration.config.ts tests/integration/nft-gate.integration.test.ts
 *
 * Each run creates its own scratch gates on the LIVE `access_gate` (a paid gate costs gas only; the key is
 * the payment recipient, so a pass costs the 0.0005 SUI commission) and buys a few passes: about 0.05 SUI per
 * run, nothing is left to clean up. The key is read once and never printed.
 *
 * Findings this pins (2026-10-22, key servers: Mysten testnet committee):
 * - a refusal reaches the client as `NoAccessError` ("User does not have access to one or more of the
 *   requested keys") WITHOUT the Move abort, so `classifyPolicyAbort` cannot read it from the decrypt error;
 *   the same abort is read by simulating the approve PTB (`explainAs` below, via `SealController.explainRefusal`);
 * - a non-owner presenting someone else's address-owned pass is `InvalidParameterError` ("PTB contains an
 *   invalid parameter, possibly a newly created object that the FN has not yet seen");
 * - `SealController.explainRefusal` (0.0.23) does that simulation for the app and returns the classified reason; every
 *   negative below asserts it (and the positive asserts `allowed`);
 * - one SealController (one SealClient) caches the keys it has fetched, so a pause or an exhausted pass takes
 *   effect only for a NEW controller: every refusal below uses a fresh one.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeAll } from 'vitest'
import { InvalidParameterError, NoAccessError } from '@mysten/seal'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { accessGateDeployment } from '@meddleware/access-gate-client/deployments'
import {
  accessNftType,
  buildConsumeTx,
  buildCreateGateTx,
  buildPurchaseTx,
  buildSetPausedTx,
  parseAccessGateEvent,
} from '@meddleware/access-gate-client'
import type { GateAdminContext } from '@meddleware/access-gate-client'
import { SealController } from '../../src/controller.js'
import type { KeyServerConfig } from '../../src/controller.js'
import { REASON_NOT_OWNER } from '../../src/refusal.js'
import { createDefaultRegistry } from '../../src/default-registry.js'
import { sealPoliciesDeployment } from '../../src/deployments.js'

const KEY_FILE = process.env.SEAL_LIVE_KEY_FILE
const ENABLED = process.env.SEAL_TESTNET === '1' && !!KEY_FILE

// Public Mysten Labs testnet committee (as in timelock.integration.test.ts): 2-of-3.
const SERVERS: KeyServerConfig[] = [
  {
    objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
    weight: 1,
    aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
  },
  { objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75', weight: 1 },
  { objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8', weight: 1 },
]
const POLICY = sealPoliciesDeployment('testnet')
const GATE = accessGateDeployment('testnet')
const PRICE = 5_000_000n // 0.005 SUI: the platform minimum for a paid gate at the 500_000 MIST minimum commission
const MIN_BALANCE = 150_000_000n

const client = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A new controller each time: the SealClient inside caches the keys it fetched (see the header). */
function controller(allowTransferableGates = false): SealController {
  return new SealController(
    {
      suiClient: client,
      ...POLICY,
      serverConfigs: SERVERS,
      threshold: 2,
      verifyKeyServers: false, // the committee server is reached through its aggregator
      accessGateOriginalId: GATE.originalId,
      allowTransferableGates,
    },
    createDefaultRegistry(GATE.originalId),
  )
}

/** What the library says about a refusal: `SealController.explainRefusal` (simulates the approve PTB as `sender`). */
const explainAs = (
  sender: string,
  g: { gateId: string; soulbound: boolean },
  nftId: string,
  s: { id: string },
) => controller().explainRefusal('nft-gate', { gateId: g.gateId, nftId, soulbound: g.soulbound }, s.id, { address: sender })

describe.skipIf(!ENABLED)('sealed-storage-client live nft-gate round trip with negatives (maintainer-run, spends testnet SUI)', () => {
  const plaintext = new TextEncoder().encode('sealed-storage-client live nft-gate round trip')
  let keypair: Ed25519Keypair
  let address: string
  const sign = (kp: Ed25519Keypair) => (m: Uint8Array) => kp.signPersonalMessage(m)

  interface Gate extends GateAdminContext {
    soulbound: boolean
  }
  const gates: Record<'main' | 'other' | 'transferable', Gate> = {} as never
  let passA = '' // main gate, exhausted (consumed once)
  let passB = '' // main gate, one use left
  let sealed: { id: string; ciphertext: Uint8Array } // content of the main gate
  let sealedOther: { id: string; ciphertext: Uint8Array } // content of the other gate

  async function run(tx: Transaction) {
    tx.setSenderIfNotSet(address)
    const bal = BigInt((await client.core.getBalance({ owner: address })).balance.balance)
    if (bal < MIN_BALANCE) throw new Error(`the live key holds ${bal} MIST, below the ${MIN_BALANCE} MIST floor`)
    const res = await client.signAndExecuteTransaction({ transaction: tx, signer: keypair, include: { effects: true, events: true } })
    const body = res.Transaction ?? res.FailedTransaction
    if (res.$kind === 'FailedTransaction') throw new Error(`transaction ${body.digest} failed: ${JSON.stringify(body.status)}`)
    await client.core.waitForTransaction({ digest: body.digest, timeout: 60_000 })
    return body
  }
  function eventOf<K extends string>(body: Awaited<ReturnType<typeof run>>, kind: K) {
    for (const [i, e] of (body.events ?? []).entries()) {
      const p = parseAccessGateEvent(
        { eventType: e.eventType, bcs: e.bcs, transactionDigest: body.digest, eventIndex: i, checkpoint: null, sender: address },
        GATE.originalId,
      )
      if (p?.kind === kind) return p as Extract<NonNullable<typeof p>, { kind: K }>
    }
    throw new Error(`no ${kind} event in ${body.digest}`)
  }
  async function createGate(label: string, soulbound: boolean, policy?: Parameters<typeof buildCreateGateTx>[2]['policy']): Promise<Gate> {
    const body = await run(
      buildCreateGateTx(GATE.publishedAt, GATE.platformConfigId, {
        priceMist: PRICE,
        paymentRecipient: address,
        defaultUses: 1,
        soulbound,
        autoBurnAtZero: false,
        nftName: `sealed-storage-client live ${label}`,
        nftImageUrl: 'https://meddleware.co.uk/x.png',
        nftDescription: 'scratch gate of the sealed-storage-client live nft-gate test',
        policy,
      }),
    )
    const created = eventOf(body, 'GateCreated')
    return { packageId: GATE.publishedAt, gateId: created.gateId, adminCapId: created.adminCapId, platformConfigId: GATE.platformConfigId, soulbound }
  }
  const nftConfig = (g: Gate) => ({
    packageId: GATE.publishedAt,
    gateId: g.gateId,
    platformConfigId: GATE.platformConfigId,
    nftType: accessNftType(GATE.originalId, g.soulbound),
    soulbound: g.soulbound,
  })
  async function buyPass(g: Gate): Promise<string> {
    return eventOf(await run(buildPurchaseTx(nftConfig(g), PRICE)), 'AccessMinted').nftId
  }
  const decryptAs = (kp: Ed25519Keypair, g: Gate, nftId: string, s: { id: string; ciphertext: Uint8Array }, ctl = controller()) =>
    ctl.decrypt('nft-gate', { gateId: g.gateId, nftId, soulbound: g.soulbound }, s.id, s.ciphertext, {
      address: kp.toSuiAddress(),
      signPersonalMessage: sign(kp),
    })

  beforeAll(async () => {
    keypair = Ed25519Keypair.fromSecretKey(readFileSync(KEY_FILE as string, 'utf8').trim())
    address = keypair.toSuiAddress()
    gates.main = await createGate('main', true, {
      freezeRequiresUnpaused: true,
      lockCommissionOnFreeze: false,
      pauseBlocksDecryption: true,
      pauseBlocksAccess: true,
    })
    gates.other = await createGate('other', true)
    gates.transferable = await createGate('transferable', false)
    passA = await buyPass(gates.main)
    passB = await buyPass(gates.main)
    await run(buildConsumeTx(nftConfig(gates.main), passA, 'live-exhaust-nonce'))
    sealed = await controller().encrypt('nft-gate', { gateId: gates.main.gateId }, plaintext)
    sealedOther = await controller().encrypt('nft-gate', { gateId: gates.other.gateId }, plaintext)
    await sleep(5000) // let the key servers' full nodes see the new objects
  }, 300_000)

  it('positive: the owner of a valid pass decrypts', async () => {
    expect(await decryptAs(keypair, gates.main, passB, sealed)).toEqual(plaintext)
    expect(await explainAs(address, gates.main, passB, sealed)).toMatchObject({ kind: 'allowed' })
  }, 120_000)

  it('negative: an address that does not own the pass is refused (InvalidParameterError)', async () => {
    const stranger = new Ed25519Keypair()
    const err = await decryptAs(stranger, gates.main, passB, sealed).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(InvalidParameterError)
    expect((err as Error).message).toContain('PTB contains an invalid parameter')
    expect(await explainAs(stranger.toSuiAddress(), gates.main, passB, sealed)).toMatchObject({ kind: 'refused', reason: REASON_NOT_OWNER })
  }, 120_000)

  it('negative: a pass of another gate (E_WRONG_GATE)', async () => {
    const err = await decryptAs(keypair, gates.other, passB, sealedOther).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NoAccessError)
    expect((err as Error).message).toBe('User does not have access to one or more of the requested keys')
    expect(await explainAs(address, gates.other, passB, sealedOther)).toMatchObject({ kind: 'refused', module: 'nft_gate', reason: 'E_WRONG_GATE', code: 2 })
  }, 120_000)

  it('negative: an identity that is not namespaced to the gate (E_ID_NOT_NAMESPACED); the controller refuses it before any key request', async () => {
    // Content sealed for the OTHER gate, presented against the main gate: the controller's own check fires first.
    await expect(
      controller().decrypt('nft-gate', { gateId: gates.main.gateId, nftId: passB, soulbound: true }, sealedOther.id, sealedOther.ciphertext, {
        address,
        signPersonalMessage: sign(keypair),
      }),
    ).rejects.toThrow(/id\/params mismatch/)
    // Only a hand-built request could reach a key server with it; the approve dry run it would run aborts.
    expect(await explainAs(address, gates.main, passB, sealedOther)).toMatchObject({ kind: 'refused', module: 'nft_gate', reason: 'E_ID_NOT_NAMESPACED', code: 1 })
  }, 120_000)

  it('negative: an exhausted single-use pass (E_EXHAUSTED)', async () => {
    const err = await decryptAs(keypair, gates.main, passA, sealed).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NoAccessError)
    expect(await explainAs(address, gates.main, passA, sealed)).toMatchObject({ kind: 'refused', module: 'nft_gate', reason: 'E_EXHAUSTED', code: 3 })
  }, 120_000)

  it('negative: a paused gate whose policy blocks decryption (E_GATE_PAUSED), then it resumes', async () => {
    const warm = controller()
    expect(await decryptAs(keypair, gates.main, passB, sealed, warm)).toEqual(plaintext) // `warm` now holds the key
    await run(buildSetPausedTx(gates.main, true))
    try {
      await sleep(5000)
      const err = await decryptAs(keypair, gates.main, passB, sealed).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(NoAccessError)
      expect(await explainAs(address, gates.main, passB, sealed)).toMatchObject({ kind: 'refused', module: 'nft_gate', reason: 'E_GATE_PAUSED', code: 4 })
      // A controller that already fetched the key keeps decrypting: a revocation reaches only new key requests.
      expect(await decryptAs(keypair, gates.main, passB, sealed, warm)).toEqual(plaintext)
    } finally {
      await run(buildSetPausedTx(gates.main, false))
    }
    await sleep(5000)
    expect(await decryptAs(keypair, gates.main, passB, sealed)).toEqual(plaintext)
  }, 300_000)

  it('negative: a time-lock that has not opened (E_TOO_EARLY)', async () => {
    const ctl = controller()
    const { id, ciphertext } = await ctl.encrypt('time-lock', { unlockMs: Date.now() + 86_400_000, allowPast: true }, plaintext)
    const err = await ctl.decrypt('time-lock', {}, id, ciphertext, { address, signPersonalMessage: sign(keypair) }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NoAccessError)
    expect(await ctl.explainRefusal('time-lock', {}, id, { address })).toMatchObject({ kind: 'refused', module: 'timelock', reason: 'E_TOO_EARLY', code: 2 })
  }, 120_000)

  it('F16: a frozen transferable pass opens the content to any address; the default config refuses to seal to such a gate', async () => {
    // sealed-storage-client's default refuses to seal to a gate that mints transferable passes.
    await expect(controller().encrypt('nft-gate', { gateId: gates.transferable.gateId }, plaintext)).rejects.toThrow(/transferable/)
    const ctl = controller(true)
    const s = await ctl.encrypt('nft-gate', { gateId: gates.transferable.gateId }, plaintext)
    const pass = await buyPass(gates.transferable)
    await sleep(5000)
    const stranger = new Ed25519Keypair()
    expect(await decryptAs(keypair, gates.transferable, pass, s, controller(true))).toEqual(plaintext)
    await expect(decryptAs(stranger, gates.transferable, pass, s, controller(true))).rejects.toBeInstanceOf(InvalidParameterError)
    // The holder freezes the pass (it has `store`): from now on nobody owns it, so anybody may present it.
    const tx = new Transaction()
    tx.moveCall({
      target: '0x2::transfer::public_freeze_object',
      typeArguments: [accessNftType(GATE.originalId, false)],
      arguments: [tx.object(pass)],
    })
    await run(tx)
    await sleep(5000)
    expect(await decryptAs(stranger, gates.transferable, pass, s, controller(true))).toEqual(plaintext)
  }, 300_000)
})
