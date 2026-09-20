/**
 * End-to-end integration harness for SealController using the public Mysten Labs testnet
 * committee. Uses the time-lock policy with a timestamp 10 minutes in the past so the key-server
 * dry-run always approves — no NFT and no funded account are required, since the time-lock
 * seal_approve only reads the shared Clock object.
 *
 * Requires: SEAL_TESTNET=1 (network calls to testnet + Mysten key servers).
 *   npm run test:integration
 *
 * What this verifies end-to-end:
 *   encrypt → key-server public-key fetch → threshold ciphertext construction
 *   → SessionKey personal-message sign → PTB build with Clock object resolution
 *   → key-server approve dry-run + share fetch → threshold decombine → plaintext
 */
import { describe, it, expect } from 'vitest'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { SealController } from '../../src/controller.js'
import { createDefaultRegistry } from '../../src/default-registry.js'

// Public Mysten Labs testnet committee — three servers, 2-of-3 threshold.
// Server 0: committee-mode (aggregatorUrl required); servers 1-2: independent (URL on-chain).
// These match the defaults in seal-ui/src/config.ts.
const PACKAGE_ID = '0x9f0563bfe42fbd29932cd280cc47efe17f5339b4dc569eb110114665eecc231e'
const SERVER_CONFIGS = [
  {
    objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
    weight: 1,
    aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
  },
  {
    objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
    weight: 1,
  },
  {
    objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
    weight: 1,
  },
]
const THRESHOLD = 2

function makeSuiClient() {
  return new SuiGrpcClient({
    network: 'testnet',
    baseUrl: 'https://fullnode.testnet.sui.io:443',
  })
}

function makeController(suiClient: SuiGrpcClient) {
  return new SealController(
    {
      suiClient,
      packageId: PACKAGE_ID,
      serverConfigs: SERVER_CONFIGS,
      threshold: THRESHOLD,
      verifyKeyServers: false, // committee servers skip service verification via aggregator
    },
    createDefaultRegistry(),
  )
}

describe.skipIf(process.env.SEAL_TESTNET !== '1')(
  'seal-client live integration — public testnet committee (run with SEAL_TESTNET=1)',
  () => {
    it(
      'encrypts and decrypts a payload using a past-timestamp time-lock (unfunded keypair)',
      async () => {
        const suiClient = makeSuiClient()
        const controller = makeController(suiClient)
        const keypair = new Ed25519Keypair()
        const address = keypair.getPublicKey().toSuiAddress()
        const signPersonalMessage = async (message: Uint8Array) => keypair.signPersonalMessage(message)

        const plaintext = new TextEncoder().encode('Hello, Seal testnet!')
        const unlockMs = Date.now() - 10 * 60_000 // 10 min in the past

        const { id, ciphertext } = await controller.encrypt('time-lock', { unlockMs }, plaintext)
        expect(id).toMatch(/^[0-9a-f]+$/)

        const decrypted = await controller.decrypt('time-lock', {}, id, ciphertext, {
          address,
          signPersonalMessage,
        })

        expect(decrypted).toEqual(plaintext)
      },
      120_000,
    )

    it(
      'clearSession evicts the cached SessionKey so a second decrypt re-signs',
      async () => {
        const suiClient = makeSuiClient()
        const controller = makeController(suiClient)
        const keypair = new Ed25519Keypair()
        const address = keypair.getPublicKey().toSuiAddress()

        let signCallCount = 0
        const signPersonalMessage = async (message: Uint8Array) => {
          signCallCount++
          return keypair.signPersonalMessage(message)
        }

        const plaintext = new TextEncoder().encode('session eviction test')
        const unlockMs = Date.now() - 10 * 60_000
        const { id, ciphertext } = await controller.encrypt('time-lock', { unlockMs }, plaintext)

        await controller.decrypt('time-lock', {}, id, ciphertext, { address, signPersonalMessage })
        expect(signCallCount).toBe(1)

        controller.clearSession(address)

        await controller.decrypt('time-lock', {}, id, ciphertext, { address, signPersonalMessage })
        expect(signCallCount).toBe(2)
      },
      240_000, // two full decrypt round-trips
    )
  },
)
