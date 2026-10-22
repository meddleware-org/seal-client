# @meddleware/seal-client

Modular [Seal](https://seal-docs.wal.app/) encryption for Sui — the client half of Meddleware
**Sealed Storage**. Pairs with the [`seal_policies`](https://github.com/meddleware-org/seal-policies-sui)
Move package (each policy provider here mirrors one Move module).

## Install

```sh
npm install @meddleware/seal-client @mysten/seal @mysten/sui
```

`@mysten/seal` and `@mysten/sui` are peer dependencies (the app provides a single instance).
[`@meddleware/access-gate-client`](https://github.com/meddleware-org/access-gate-client) is a
dependency: the nft-gate provider reads gates through it.

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
import { sealPoliciesDeployment } from '@meddleware/seal-client/deployments'
import { accessGateDeployment } from '@meddleware/access-gate-client/deployments'

const suiClient = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' })
// nft-gate + time-lock; the access_gate id enables the nft-gate provider's gate suggestions
const registry = createDefaultRegistry(accessGateDeployment('testnet').originalId)

const seal = new SealController(
  {
    suiClient,
    // originalId: Seal identity namespace + SessionKey scope; publishedAt: seal_approve call target;
    // policyConfigId: the shared version gate every seal_approve reads
    ...sealPoliciesDeployment('testnet'),
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
(its own threshold is internal, and `verifyKeyServers` is off for it). MeddleWare's apps use
**independent keyless key servers at `threshold: 2`** (workspace ADR-0002: three Open-mode servers on
mainnet), because confidentiality beyond one operator needs at least two independent ones. An API key
(`apiKeyName` / `apiKey`, for a Permissioned server or an authenticated aggregator) is **public** once
it ships in a browser bundle, so do not rely on one for secrecy.

Sealing to a gate that mints transferable passes is refused by default (`allowTransferableGates` opts in): a holder can freeze such a pass into public access, so seal to soulbound gates.

Safety defaults: the threshold must lie in `[1, total weight]`; `verifyKeyServers` is on unless a
server uses an aggregator (one switch for the whole configuration, so a mixed setup of an aggregator plus
independent servers runs without URL verification for the independent ones too —
`controller.verifiesKeyServers` tells you); `checkShareConsistency` is on; and `decrypt` refuses a ciphertext whose
header names a different identity or policy package than expected.

## Package ids

`seal_policies` has two package ids per network, and they differ once the package is upgraded:

- **`originalId`** — Seal binds identities to it. It is used to encrypt, to scope the SessionKey,
  and to match events.
- **`publishedAt`** — the latest version. `seal_approve*` and `sealed_content::publish` are called
  on it.

It also has one shared object, **`policyConfigId`** (`PolicyConfig`): every `seal_approve*` and
`sealed_content::publish` takes it and aborts (`config::E_WRONG_VERSION`) under a retired package
version, so an upgrade can retire old code everywhere at once.

All three come from `@meddleware/seal-client/deployments`, which is generated from the
`Published.toml` and `deployments.json` that `@meddleware/seal-policies-sui` publishes. Pass
`{ publishedAt, policyConfigId }` (a `SealPolicyTarget`) wherever a call target is needed.

## Telling aborts apart

The small abort codes of the `seal_policies` modules overlap (`nft_gate`, `timelock`, `config` and `sealed_content` all use `1`), so read the
**module and the code** together, never the code alone. `classifyPolicyAbort` does this for the `seal_policies` modules:

```ts
import { classifyPolicyAbort } from '@meddleware/seal-client'

const abort = classifyPolicyAbort(executionError, { policyPackageIds: [deployment.originalId, deployment.publishedAt] })
if (abort?.module === 'nft_gate' && abort.code === 4) showPaused() // E_GATE_PAUSED: access resumes when the operator unpauses
else if (abort?.module === 'config' && abort.code === 1) rebuildAgainstCurrentPublishedAt() // E_WRONG_VERSION
```

`POLICY_ABORTS` lists every code (name, meaning, advice); `describePolicyAbort(module, code)` looks one up and
`parseMoveAbort` reads the abort out of a message, a structured status or an error's `cause` chain. Pass `policyPackageIds`
so an abort from another package's module of the same name (for example `access_gate`) is not named.

### Why was this decrypt refused? `explainRefusal`

**A key server's refusal does not carry the abort.** The public testnet committee answers with `NoAccessError` ("User does not have access to one
or more of the requested keys") for every policy abort, and with `InvalidParameterError` when the requester does not own an address-owned pass, so
`classifyPolicyAbort(error)` finds nothing in the error of `decrypt`. The same approve transaction, simulated by the client as the requester, does
abort with the real code. `SealController.explainRefusal` runs that simulation:

```ts
import { NoAccessError, InvalidParameterError } from '@mysten/seal'

try {
  return await controller.decrypt('nft-gate', params, id, ciphertext, { address, signPersonalMessage })
} catch (e) {
  if (!(e instanceof NoAccessError || e instanceof InvalidParameterError)) throw e
  // One extra read-only RPC, only because the app asks for it. It never signs and never spends.
  const why = await controller.explainRefusal('nft-gate', params, id, { address })
  switch (why.kind) {
    case 'refused': // why.reason: 'E_GATE_PAUSED' | 'E_EXHAUSTED' | 'E_WRONG_GATE' | 'E_TOO_EARLY' | 'E_WRONG_VERSION' | 'NOT_OWNER' | …
      showToUser(why.message) // UI text, e.g. "Access is paused by the gate operator. It resumes when the gate is unpaused."
      break
    case 'allowed': // the policy approves this address: the key servers were the problem (down, below the threshold, stale view)
    case 'unknown': // the simulation could not run or be read: why.cause / why.raw
      showToUser(why.message)
  }
}
```

The result is `{ kind: 'allowed' | 'refused' | 'unknown', reason?, module?, code?, message, advice?, cause?, raw? }`:

- `refused`: the approve call aborts, or the requester does not own the presented pass (`reason: 'NOT_OWNER'`, no module or code: the node refuses to
  simulate it). `reason` is the Move constant's name; it is absent when the abort is not one this package knows (another package's module, or a code the
  table does not define), but `module`, `code` and `raw` are still set. `message` is text for the user; `advice` is the developer-facing hint from `POLICY_ABORTS`.
- `allowed`: the policy approves this address, so the refusal came from the key servers (unreachable, fewer than the threshold answering, or a full node that
  has not seen a new object yet).
- `unknown`: a network error, a node that rejects the build, a failure that is not a Move abort, or a result in a shape this package does not read.
  It never throws on a refusal; only an unregistered policy `type` throws, as `decrypt` does.

Behaviour to know: `decrypt` does not call it (that would add an RPC to every failure and change what `decrypt` throws), and it needs no SessionKey. Because a
`SealController` keeps the keys it has fetched, a pause or an exhausted pass reaches only a controller created afterwards, while `explainRefusal` always asks
the chain now. Without a controller, `explainApproveRefusal(client, approveTx, { sender, policyPackageIds })` explains a transaction you built yourself.
Trust: the answer is the chain's view through the full node your client uses, an estimate for the UI; the key servers decide.

## Re-sealing onto new key servers

A ciphertext can only be decrypted by the key servers it was sealed to. To move content to a new
server set (for example when a provider withdraws), decrypt it with a controller configured for the
servers its header records, then encrypt the plaintext with the current controller:

```ts
import { describeCiphertext, sealedUnderServers } from '@meddleware/seal-client/controller'

const info = describeCiphertext(ciphertext) // { id, packageId, threshold, servers }
if (!sealedUnderServers(info, currentServers, currentThreshold)) {
  const old = new SealController(
    { ...deployment, suiClient, threshold: info.threshold,
      serverConfigs: info.servers.map((s) => ({ ...s, aggregatorUrl: knownAggregators[s.objectId] })) },
    registry,
  )
  const plaintext = await old.decrypt(policyType, params, info.id, ciphertext, signer)
  const { id, ciphertext: next } = await seal.encrypt(policyType, encryptParams, plaintext)
  // store `next` and write a new manifest; the old ciphertext still needs its old servers
}
```

## Sealed-content discovery

```ts
import { buildPublishSealedContentTransaction, listSealedContent } from '@meddleware/seal-client'

const tx = buildPublishSealedContentTransaction({ publishedAt, policyConfigId }, { gateId, blobId, sealId, label })

const page = await listSealedContent(suiClient, {
  originalId,
  gateId,
  indexer: { url: 'https://sui-indexer.meddleware.co.uk', network: 'testnet' }, // optional
})
page.pointers // newest first; page.cursor continues
```

- Pointers are decoded from the event BCS and must be this package's `SealedContentPublished`.
- A pointer grants nothing: confidentiality is enforced by Seal and `nft_gate`.
- **Seal gives confidentiality, not authenticity.** Anyone can seal content to a gate's namespace and
  publish a pointer for it; a pass holder will decrypt it successfully. A successful decrypt proves
  only that the item was sealed to the gate, not who wrote it. UIs should list only the operator's
  pointers:

  ```ts
  const publishers = await gateOperators(suiClient, gateId, accessGateOriginalId, [operatorWallet])
  const page = await listSealedContent(suiClient, { originalId, gateId, publishers })
  ```
- The optional indexer is display-only. A first page falls back to the full node if the indexer
  fails, times out or is **stale**: a head page whose `polledAt` (epoch ms of the indexer's last successful
  poll) is missing, `null` or more than 60 s old by this machine's clock counts as unavailable, and
  `indexerError` says why. A `polledAt` up to 5 min in the future still counts as fresh (clock skew), and
  older pages (with a cursor) are immutable history and are not checked. Override the 60 s per call with
  `indexer.staleAfterMs`. The check lives in access-gate-client's `readIndexerEvents` (`STALE_AFTER_MS`,
  `CLOCK_SKEW_TOLERANCE_MS`), so this needs `@meddleware/access-gate-client` `^0.0.10`.

## Adding a policy type

1. Add a Move module `seal_policies::<policy>` exposing `entry fun seal_approve(id, …)`.
2. Implement a `SealPolicyProvider` here whose `buildId`/`buildApprove` match that module, and whose
   `verifyId` checks the identity layout (required — `decrypt` calls it before every approve).
3. `registry.register(myProvider)` (a type that is already registered is refused; pass `{ replace: true }` to replace one on purpose). No changes to existing providers or the controller. A provider may also implement `parseParams` so `parseSealedManifest(raw, registry)` validates a manifest's params at import.
4. If it ships in the default registry, add it to `PROVIDERS` in `tests/abi-table.ts` (the offline
   test fails until you do); the testnet ABI-drift check then covers its `seal_approve*`.

## Scripts

```sh
npm run type-check
npm test
npm run check:deployments   # src/deployments.ts matches @meddleware/seal-policies-sui
npm run test:integration    # live testnet (key servers + full node, ABI drift)
```

### Live nft-gate round trip with negatives (maintainer-run, spends testnet SUI)

`tests/integration/nft-gate.integration.test.ts` seals to a gate you own, buys passes and decrypts through the public testnet Seal
key servers, then checks each refusal: a pass of another gate, an exhausted pass, a paused gate, a time-lock that has not opened, an
address that does not own the pass, and a frozen transferable pass (which opens the content to anyone, seal-policies-sui F16). It
skips unless a funded testnet key is supplied, so the weekly CI job never runs it (a funded key must not be a CI secret):

```sh
SEAL_TESTNET=1 SEAL_LIVE_KEY_FILE=/path/to/one-suiprivkey-testnet-key \
  npx vitest run --config vitest.integration.config.ts tests/integration/nft-gate.integration.test.ts
```

A run creates its own scratch gates on the live `access_gate` and costs about 0.05 SUI. A refusal reaches the caller as `NoAccessError`
("User does not have access to one or more of the requested keys") or, for a pass the requester does not own, `InvalidParameterError`: **the key
server's answer does not carry the Move abort**, so `classifyPolicyAbort` cannot read it from the error of `decrypt`. To tell a paused gate from a
used-up pass, call `controller.explainRefusal` (see "Why was this decrypt refused?"); the test calls it for every negative and asserts the classification.
A `SealController` keeps the keys it has fetched, so a pause or an exhausted pass takes effect only for a controller created afterwards.

## License

BSD Zero Clause License (`0BSD`). See [LICENSE](LICENSE).
