# CLAUDE.md — @meddleware/seal-client

## What this package is

The **client half of Sealed Storage**: modular [Seal](https://seal-docs.wal.app/) threshold
encryption for Sui. A pluggable **policy registry** (nft-gate, time-lock, …) plus a `SealController`
that orchestrates threshold encrypt/decrypt over a key-server committee and manages the per-address
`SessionKey`. The on-chain half is the `seal_policies` Move package
([seal-policies-sui](https://github.com/meddleware-org/seal-policies-sui)); each provider here mirrors
one Move module 1:1.

## Architectural invariants

- **Providers are peers; the registry is the only extension seam.** A `SealPolicyProvider` knows how
  to build the Seal identity bytes (`buildId`) and append its `seal_approve*` move call
  (`buildApprove`). No provider is privileged. Adding a policy type = one new provider here + one new
  Move module; existing providers and the controller are untouched.
- **No policy logic in the controller.** `SealController` only orchestrates Seal's threshold
  encrypt/decrypt and the SessionKey lifecycle. It never encodes what a policy means — that lives
  entirely in providers, so new policies need zero controller changes.
- **Identity byte layout is defined in exactly one place.** `bytes.ts` holds the dependency-free
  byte helpers, and each provider's `buildId` composes them so the on-chain `seal_approve` decode
  matches **bit-for-bit** (e.g. nft-gate = `[32-byte gate id][16-byte nonce]`; time-lock =
  `[8-byte BE unlock_ms][8-byte nonce]`). Do not change a layout on one side only.
- **The manifest is the interchange format.** `SealedManifest` (`{ policyType, id, blobId, network,
  params? }`) is the portable pointer between encrypt and decrypt. `id` (the Seal identity, hex) must
  be persisted verbatim — it cannot be recomputed. `params` carries only **non-secret** objects
  needed to rebuild the approve PTB (e.g. `gateId`).
- **SessionKey is signed once, cached until expiry.** `decrypt` mints a `SessionKey` per address via
  a single wallet personal-message signature and caches it, expiring a minute early so a
  just-expired key is never handed to a key server.
- **Committee mode is testnet-only today.** Independent key servers (each with an `aggregatorUrl`)
  and `verifyKeyServers` are gated to testnet; the mainnet-pending path is tracked in the Sealed
  Storage plan and mirrored by `seal-ui`'s `SEAL_CONFIGURED` gating.
- **`@mysten/seal` + `@mysten/sui` are peer deps.** The consuming app supplies a single instance;
  this package must not bundle its own.

## Key files

| File | Purpose |
| --- | --- |
| `src/types.ts` | Core contracts: `SealPolicyProvider`, `PolicyDescriptor`/`FieldSpec` (drive the generic UI), `SealedManifest`, `SuggestContext`. |
| `src/registry.ts` | `PolicyRegistry` — register/get/has/list; `list()` drives the UI picker. |
| `src/default-registry.ts` | `createDefaultRegistry(accessGatePackageId?)` preloaded with nft-gate + time-lock. |
| `src/controller.ts` | `SealController` — threshold encrypt/decrypt + SessionKey cache. |
| `src/providers/nft-gate.ts` | Access-gate NFT ownership policy; `suggest()` lists the wallet's gates via `AdminCap`. |
| `src/providers/timelock.ts` | Clock-based time-lock policy (`0x6`). |
| `src/sealed-content.ts` | Optional on-chain discovery pointer (`sealed_content::publish` + event type). |
| `src/bytes.ts` | Hex/id/u64-BE/nonce/concat helpers — the single source of identity-byte truth. |
| `src/index.ts` | Public surface (types, registry, controller, providers, sealed-content helpers). |

## What NOT to do

- Do not put policy-specific behaviour in `SealController`; write a provider.
- Do not change an identity byte layout without changing the matching Move module.
- Do not hold or derive decryption keys — the key-server committee does that.
- Do not bundle `@mysten/seal` / `@mysten/sui`; they are peers.

---

## Deferred documentation — NOT for the `docs.` website (planned here per Part 0.4)

> Captured for the future **`dev.meddleware.co.uk`** subdomain and white-label offering; excluded
> from the user-facing `docs.` site.

### `dev.` — developer integration (to write later)

- **Full SDK reference** (TypeDoc target — this package is a clean autodoc source: everything is
  exported from `src/index.ts` with thorough doc comments): `SealController`, `PolicyRegistry`,
  `SealPolicyProvider`, `SealedManifest`, the byte helpers, and both built-in providers.
- **"Write your own policy" guide:** the three-step contract (Move `seal_approve` module → provider
  `buildId`/`buildApprove` mirroring it → `registry.register`), with the identity-layout matching
  rule called out as the main footgun.
- **End-to-end integration recipe:** wiring `SealController` + a Walrus storage seam + manifest
  persistence into a host app (the shape `seal-ui` implements). Include the committee/threshold
  config and the SessionKey signing hook.
- **Schemas:** `SealedManifest` and `SealedContentPointer` JSON shapes; the `SealedContentPublished`
  event type for indexing.

### White-label (to write later)

- Running the client against an operator's **own `seal_policies` deployment + key-server committee**:
  which config to change (`packageId`, `serverConfigs`, `threshold`, network) and how policy sets are
  operator-defined by which providers/modules they ship.
