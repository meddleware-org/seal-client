# Changelog

All notable changes to `@meddleware/seal-client` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

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
