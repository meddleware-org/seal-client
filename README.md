# @meddleware/seal-client

Modular [Seal](https://seal-docs.wal.app/) encryption for Sui — the client half of Meddleware
**Sealed Storage**. Pairs with the [`seal_policies`](https://github.com/meddleware-org/seal-policies-sui)
Move package (each policy provider here mirrors one Move module).

## Install

```sh
npm install @meddleware/seal-client @mysten/seal @mysten/sui
```

`@mysten/seal` and `@mysten/sui` are peer dependencies (the app provides a single instance).

## Concepts

- **`SealPolicyProvider`** — one access policy. Knows how to build the Seal *identity* bytes for a
  new ciphertext (`buildId`) and how to append its `seal_approve` move call for decryption
  (`buildApprove`). Providers are peers; none is privileged.
- **`PolicyRegistry`** — register providers; a UI iterates `list()` to render its picker. Adding a
  policy type = register one provider (+ ship the matching Move module).
- **`SealController`** — orchestrates threshold `encrypt`/`decrypt` over a key-server committee and
  manages the per-address `SessionKey` (signed once, cached until it expires). No policy logic lives
  here.

Built-in providers: `nft-gate` (access-gate NFT ownership) and `time-lock` (Clock-based TLE).

## Usage

```ts
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { createDefaultRegistry } from '@meddleware/seal-client'
import { SealController } from '@meddleware/seal-client/controller' // also on the main entry; the subpath lets apps lazy-load @mysten/seal

const suiClient = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' })
const registry = createDefaultRegistry() // nft-gate + time-lock

const seal = new SealController(
  {
    suiClient,
    packageId: SEAL_POLICIES_PACKAGE_ID, // published seal_policies package
    threshold: 2,
    serverConfigs: [
      { objectId: KS1, weight: 1, aggregatorUrl: AGG1 },
      { objectId: KS2, weight: 1, aggregatorUrl: AGG2 },
      { objectId: KS3, weight: 1, aggregatorUrl: AGG3 },
    ],
  },
  registry,
)

// Encrypt to an access gate (holders of a valid pass can decrypt).
const { id, ciphertext } = await seal.encrypt('nft-gate', { gateId }, bytes)
// …store `ciphertext` on Walrus; persist { policyType:'nft-gate', id, blobId, params:{ gateId } }.

// Decrypt (signs one personal message to mint a SessionKey).
const plaintext = await seal.decrypt(
  'nft-gate',
  { gateId, nftId, soulbound: false },
  id,
  ciphertext,
  { address, signPersonalMessage },
)
```

A key-server committee reached through an aggregator (`aggregatorUrl`) counts as **one** server
(its own threshold is internal). On mainnet, use the verified committee behind the Mysten mainnet
aggregator at `threshold: 1`; that aggregator needs an Enoki API key, passed per server as
`{ apiKeyName: 'X-API-Key', apiKey }`.

Safety defaults: the threshold must lie in `[1, total weight]`; `verifyKeyServers` is on unless a
server uses an aggregator; `checkShareConsistency` is on; and `decrypt` refuses a ciphertext whose
header names a different identity or policy package than expected.

## Adding a policy type

1. Add a Move module `seal_policies::<policy>` exposing `entry fun seal_approve(id, …)`.
2. Implement a `SealPolicyProvider` here whose `buildId`/`buildApprove` match that module.
3. `registry.register(myProvider)`. No changes to existing providers or the controller.

## Scripts

```sh
npm run type-check
npm test
```

## License

BSD Zero Clause License (`0BSD`). See [LICENSE](LICENSE).
