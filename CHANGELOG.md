# Changelog

All notable changes to `@meddleware/seal-client` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

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
