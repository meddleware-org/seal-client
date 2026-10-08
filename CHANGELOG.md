# Changelog

All notable changes to `@meddleware/seal-client` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [0.0.17] - 2026-10-08

### Fixed

- `parseSealedManifest` requires the identity (`id`) to be even-length hex, and, given a registry, checks the
  policy type and lets the provider validate and narrow `params` (`parseParams`; nft-gate requires 0x object
  ids and a boolean `soulbound`, and keeps only known keys). A manifest that cannot decrypt now fails at import.
- `listSealedContent` skips and counts a row that does not decode (`page.skipped`) instead of failing the page,
  and caps the full-node scan at 20 pages (each page scans 50 events of every gate).
- `PolicyRegistry.register` refuses a second provider for a registered type unless `{ replace: true }`.

### Added

- `SealController.verifiesKeyServers`: key-server URL verification is one SDK switch, off as soon as any
  server uses an aggregator, so a mixed configuration does not verify the independent servers. Documented in
  the README, `SECURITY.md` and the config docs.

### Changed

- `SECURITY.md` ships in the package and its list is renumbered; it states that only the current policy
  package decrypts (superseded namespaces are unsupported).
- CI: the tag workflow runs the CI workflow (lint was missing), a package-contents check and the build; no
  step uses `--if-present`. A weekly workflow runs the live testnet suite (ABI drift, event decoding,
  time-lock round trip). Peer floor `@mysten/seal` ^1.4.18.
- Requires `@meddleware/access-gate-client` ^0.0.7.
- Doc fixes: `decrypt` lists the checks it makes before requesting keys; a misplaced doc comment; CLAUDE.md
  dependency version.

## [0.0.16] - 2026-10-08

### Changed (breaking, pre-v0.2)

- `@meddleware/access-gate-client` ^0.0.6.
- `timeLockProvider.buildId` rejects a value that would wrap past 2^64 - 1 (`u64beBytes` now throws),
  a non-safe-integer number, and an unlock time in the past unless `allowPast: true`; `unlockMs` may be a
  `bigint`.
- The `nft-gate` provider refuses an empty, `0x`-only, non-hex or zero gate id.
- SessionKey cache margin counts from key creation (not from the signature returning), and concurrent
  decrypts share one mint and one wallet prompt.
- `sealPoliciesDeployment` no longer resolves `constructor`, `toString`, `__proto__` etc.
- Ships `.d.ts` (`dist/`, like its siblings); `prepublishOnly` builds them.
- README follows ADR-0002 (independent keyless servers at threshold 2; an API key in a bundle is public).

### Added

- `listSealedContent({ publishers })` and `gateOperators(client, gateId, accessGateOriginalId, extra?)`:
  Seal gives confidentiality, not authenticity, so UIs should list only the operator's pointers.
- `SealControllerConfig.accessGateOriginalId` + `assertLinkedGate`: `encrypt` for `nft-gate` refuses a
  gate that is not a `Gate` of the linked `access_gate` package.
- Hermetic tests for `encrypt` (namespace is the original id after an upgrade), session timing and
  coalescing, the publisher filter and the u64 boundaries.

## [0.0.15] - 2026-10-03

### Changed

- `@meddleware/access-gate-client` ^0.0.4 (full recipient addresses).

### Documentation

- `SECURITY.md` states the trust assumptions users need: key-server threshold, the policy
  UpgradeCap's power over existing ciphertexts, permanent key release, public identities.

## [0.0.14] - 2026-10-02

### Changed

- **Breaking:** `SealPolicyProvider.verifyId` is required, and `decrypt` always calls it before the
  approve PTB, so every policy checks the identity it will be approved against. The nft-gate provider
  now also requires the exact `[32-byte gate][16-byte nonce]` length.
- `decrypt` refuses an approve PTB that holds anything but `seal_approve*` calls to the policy
  package (`assertApproveOnly`, exported); an empty PTB is refused too.
- `noUncheckedIndexedAccess` is on.

## [0.0.13] - 2026-10-02

### Changed

- `@meddleware/access-gate-client` 0.0.3: gate suggestions use its fail-closed parsers (a gate with
  a missing field is skipped), and `listSealedContent` reads the indexer through the shared
  `readIndexerEvents` — https only (loopback http allowed), a 1 MiB body cap before parsing and a
  checked page shape. A plain-http indexer is never contacted; the first page comes from the full
  node with the reason in `indexerError`.

## [0.0.12] - 2026-10-02

### Added

- **`describeCiphertext(ciphertext)`** (`./controller`) — the identity, policy package, threshold
  and key servers (with weights) a ciphertext's header records, without decrypting.
- **`sealedUnderServers(info, servers, threshold)`** — whether a ciphertext was sealed to exactly
  this server set. Together they let an app re-seal content onto new key servers: decrypt with a
  controller for the recorded servers, then encrypt with the current one.

## [0.0.11] - 2026-10-02

Follows the version-gated `seal_policies` republish (testnet `0x61c4aa…`,
`@meddleware/seal-policies-sui` 0.0.6). Content sealed under the superseded `0x42cc18…` needs that
package's ids to decrypt; this release targets the new one.

### Changed

- **`SealPolicyProvider.buildApprove(tx, target, idBytes, params)`** — `target` is a
  `SealPolicyTarget` (`{ publishedAt, policyConfigId }`); both built-in providers pass the
  `PolicyConfig` after the identity.
- **`SealControllerConfig.policyConfigId`** is required.
- **`buildPublishSealedContentTransaction` / `buildPublishSealedContentTx`** take a `SealPolicyTarget`
  and pass the `PolicyConfig` first.
- **`./deployments`** adds `policyConfigId`; regenerated from `@meddleware/seal-policies-sui` 0.0.6.
- **`@meddleware/access-gate-client` `^0.0.2`** (the version-gated access_gate).

## [0.0.10] - 2026-10-01

### Changed

- `deployments` regenerated from `@meddleware/seal-policies-sui@0.0.5`: testnet `publishedAt` is now
  `0x8fcf9c39…15cb` (seal_policies v2, D9 string bounds on-chain). `originalId` is unchanged, so
  existing ciphertexts and identities still decrypt.

## [0.0.9] - 2026-09-30

### Added

- **`./deployments`** — `sealPoliciesDeployment(network)` returns `{ originalId, publishedAt }`.
  - Generated from `@meddleware/seal-policies-sui` 0.0.4.
  - CI checks for drift.
- **`listSealedContent(client, { originalId, gateId, limit?, cursor?, indexer?, maxPages? })`**
  (moved from seal-ui).
  - Cursor pages, newest first.
  - Pointers decoded from BCS with an exact type match.
  - Optional read-indexer source with a fallback to the full node.
  - Also exported: `parseSealedContentEvent` and `SealEventsClient`.
- **`buildPublishSealedContentTransaction(publishedAt, input)`** returns a complete `Transaction`.
- **`SealedContentPointer.txDigest` and `.checkpoint`.**

### Changed

- **`SealControllerConfig.packageId` is replaced by `originalId` and `publishedAt`.**
  - `originalId` is used to encrypt, for the ciphertext check and for the SessionKey.
  - `seal_approve*` is called on `publishedAt`.
  - This keeps encryption and decryption correct after a `seal_policies` upgrade.
- **The nft-gate provider's `suggest()` uses `@meddleware/access-gate-client`** (new dependency).
  It now reads every page and matches exact types.
  - `createNftGateProvider` and `createDefaultRegistry` take the `access_gate` **original id**.
- `sealedContentEventType(originalId)` returns the normalised type.
- **Key-server safety defaults.**
  - The threshold is validated.
  - `verifyKeyServers` is on unless a server uses an aggregator.
  - `checkShareConsistency` is on.
  - `decrypt` refuses a ciphertext sealed to another identity or package.
  - Committee API keys (`apiKeyName` / `apiKey`) are supported.

### Removed

- The deprecated `nftGateProvider` constant. Use `createNftGateProvider()`.

## [0.0.4] - 2026-09-17

### Added

- `homepage` in `package.json` — links to the Sealed Storage section of the documentation site.

## [0.0.1] - 2026-09-02

### Added

- Initial release. Modular Seal encryption client for Sui:
  - `PolicyRegistry` + `SealPolicyProvider` interface — the pluggable policy seam.
  - Built-in providers `nftGateProvider` (`nft-gate`) and `timeLockProvider` (`time-lock`),
    mirrored 1:1 with the `seal_policies` Move modules.
  - `SealController` — threshold encrypt/decrypt over a key-server committee, with per-address
    `SessionKey` lifecycle management.
  - `SealedManifest` interchange type and dependency-free byte helpers.
