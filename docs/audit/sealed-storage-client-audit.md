# Security Audit — `sealed-storage-client`

**Classification:** Internal security review (initial audit, re-verified 2026-10-09 — awaiting external review)
**Project:** sealed-storage-client (`@meddleware/sealed-storage-client`). The client half of Sealed Storage:
  - a pluggable Seal policy registry (`nft-gate`, `time-lock` providers);
  - `SealController` (threshold encrypt/decrypt over a key-server committee, SessionKey lifecycle);
  - the `SealedManifest` guard;
  - `sealed_content` discovery (publish builders, BCS event reads, optional read-indexer);
  - the generated `seal_policies` deployment IDs.

**Project type:** TS SDK (npm package; ships TypeScript source, no build step)
**Template:**

- AUDIT_TEMPLATE.md (2026-10-08)
- AUDIT_TEMPLATE_SEAL.md (2026-09-30)
- AUDIT_TEMPLATE_SUI_CLIENT.md (2026-10-08)
- AUDIT_TEMPLATE_TS.md (2026-10-08)

VUE, WALRUS, AUTH, OPS and IMG are not triggered: no UI, no storage I/O (blob ids are opaque strings; the
storage seam is the consumer's), no issued or verified credentials (the SessionKey is in-memory and
scoped, not a token this package issues), no signing scripts and no image.

**Deployment status:**

- npm `@meddleware/sealed-storage-client` **0.0.20** (`latest`, published 2026-10-18T09:06Z), from tag `v0.0.20` =
  `9ef93f9` (code commit `48fd9d6`; the later commit only records the hash in this audit). It carries an SLSA v1
  provenance attestation (`dist.attestations`, checked with `npm view` 2026-10-18). 0.0.19 (tag `v0.0.19` =
  `3527c58`, 2026-10-09) was the version of the 2026-10-09 pass; the Dependabot group bump `b4a42ea` shipped with 0.0.20.
- Working tree 2026-10-22: version **0.0.23** (local commit, not tagged or published) adds `SealController.explainRefusal` (F27, OQ5).
- Working tree 2026-10-22: version **0.0.22** (local commit, not tagged or published) adds the `seal_policies` abort
  map (S7 below; sealed-storage-sui OQ5). 0.0.21 was released in between if it has been tagged by then; this line records the working tree.
- Working tree 2026-10-20: version **0.0.21** (local commit, not tagged or published) raises the
  `@meddleware/access-gate-client` dependency to `^0.0.10` and pins the stale-head-page fallback (F26). Its lockfile
  keeps the 0.0.9 entry until access-gate-client 0.0.10 is published and `npm install` is run (the tests ran against a
  local link of the 0.0.10 working tree).
- It is consumed at `^0.0.20` (bumped 2026-10-18, verified in `repos/*/package.json`) by sealed-storage-ui, the docs and
  dev sites and sui-indexer; it was `^0.0.19` for sealed-storage-ui and docs on 2026-10-09.
- It targets `seal_policies` on testnet only (no mainnet publication exists): `0x0c8f7349…` (republished
  2026-10-09, links `access_gate` `0xd7ddaa94…`). Mainnet publication and the Seal mainnet key-server
  terms are maintainer items (`OPERATOR_TASKS.md` "Mainnet release custody", "Mainnet Seal key servers").

**Review date:** 2026-10-03; re-verified 2026-10-09; fix wave 2026-10-18; release status 2026-10-18
**Reviewer:** Internal review
**Severity ceiling:** High.

- The package does not decide access itself: key servers evaluate the on-chain policy.
- But it chooses the identity namespace and the identity bytes content is sealed to, builds the
  approve PTB, owns the SessionKey, and is the discovery path users trust.
- A wrong binding can make content permanently undecryptable, or bind it to a policy it was not meant
  for.
- Realised ceiling at the first pass: **Medium** (F6, since resolved). At the 2026-10-09 re-verification
  no finding is open above **Low**.

**Status:** first in-repo pass (2026-10-03); re-verified against 0.0.19 on 2026-10-09. Every first-pass
finding was fixed in 0.0.16–0.0.19 except the live nft-gate negatives (F10, maintainer-only; run 2026-10-22, see the log). The 2026-10-18 fix wave (0.0.20) closed F20 and F25; 0.0.20 is released (npm, 2026-10-18) and consumed at `^0.0.20`.

**Finding IDs.** The tests and `SECURITY.md` cite three findings of an earlier workspace-corpus
audit: `F2` (nonce widths), `F4` (non-hex rejection) and `F5` (id↔params cross-check). Those IDs and
meanings are preserved below. The corpus file itself was not available to this pass, so its other IDs
could not be carried over. New findings start at **F6**. If the corpus file used F6 or higher,
renumber the new findings when relocating it, and leave a pointer stub at the corpus path.

**Package manager / lockfile:** npm; `package-lock.json` committed (lockfileVersion 3).
**Module format:** ESM (`"type": "module"`).
**Publish model:** ships TS source plus declarations (`dist/*.d.ts`, built by `prepublishOnly`, F18).
`exports` (each with a `types` condition):

- `"."` → `src/index.ts`
- `"./controller"` → `src/controller.ts`
- `"./deployments"` → `src/deployments.ts`

`files` holds `src`, `dist`, `CHANGELOG.md` and `SECURITY.md`.
**Runtime targets:** browsers (via Vite in sealed-storage-ui and the dashboard) and Node (integration tests).
`engines.node` is `>=24` (fleet decision D41; F18).
**Peer dependencies:** `@mysten/seal` `^1.4.18` and `@mysten/sui` `^2.33.2` (both also
devDependencies). The runtime dependency is `@meddleware/access-gate-client` `^0.0.10` (0.0.21; `^0.0.9` at 0.0.20, `^0.0.8` at 0.0.19).

**Sui SDK:** `@mysten/sui` `^2.33.2` (installed 2.35.0, deduped). **Transport:** gRPC core API
through structural client types, plus an optional HTTPS read-indexer (display only). No JSON-RPC.
**Networks:** testnet (the only recorded deployment); an unknown network throws (F12).
**Seal SDK:** `@mysten/seal` `^1.4.18` (installed 1.4.19).

**Key-server mode / servers / threshold.** These are chosen by the consumer and validated here.
Current consumer defaults (`sealed-storage-ui/src/config.ts`):

- **testnet:** a Mysten committee behind `seal-aggregator-testnet.mystenlabs.com`, plus Mysten Open
  servers `0x73d05d62…db75` and `0xf5d14a81…23c8`, at **t = 2**.
- **mainnet:** three keyless Open servers at **t = 2**:
  - Overclock `0x145540d9…08b6`;
  - NodeInfra `0x1afb3a57…5475`;
  - H2O Nodes `0x4a65b4ff…286a`.

**verifyKeyServers:** defaults to `true` unless any server uses an aggregator, in which case it is
`false` for **all** of them (F13).
**checkShareConsistency:** defaults to `true`.
**Policy package (`seal_policies`), testnet** (from `./deployments`, generated from
`@meddleware/sealed-storage-sui@0.0.7`):

- original-id = published-at = `0x0c8f73490b14836e6a7a724fb46b242cb061d04a5f193fd637159997f8a1773d`
  (v1; links `access_gate` `0xd7ddaa94b74330979b2b618fc81206d160a264f1c9ca148a77fa2144301388c9`);
- `PolicyConfig` = `0xee0403ba15c250223527150d147f29bedfb1ec46bb2282c341be462ff0ad7d1a`;
- UpgradeCap **live** with the deploy key until the pre-mainnet custody process (see
  `sealed-storage-sui-audit.md` B.3; `OPERATOR_TASKS.md` "Mainnet release custody");
- the superseded `0x61c4aa…` package is immutable (UpgradeCap burned 2026-10-09).

**On-chain packages consumed:**

| Network | Package | original-id | published-at | Shared object | Source |
| --- | --- | --- | --- | --- | --- |
| testnet | `seal_policies` | `0x0c8f7349…773d` | same | `PolicyConfig` `0xee0403ba…7d1a` | `src/deployments.ts`, generated by `scripts/gen-deployments.mjs` and checked in CI |
| testnet | `access_gate` (suggestions, gate check, operator lookup; via access-gate-client) | caller-supplied (`accessGateDeployment(net).originalId` = `0xd7ddaa94…88c9`) | — | — | `@meddleware/access-gate-client/deployments` |

**Location:** `sealed-storage-client/docs/audit/sealed-storage-client-audit.md`. This is a new directory; see the
finding-IDs note above for the corpus file.

---

## Executive summary

`@meddleware/sealed-storage-client` is 1,320 lines in 13 modules (0.0.19; it was 1,082 lines in 11 modules at the first pass).

**What holds:**

- **Encryption binding.** `encrypt` seals under the original id; `decrypt` scopes the SessionKey to
  it and calls `seal_approve*` at published-at.
- **Ciphertext checks before key requests.** Before asking for keys, `decrypt`:
  - parses the ciphertext header and refuses a different identity or policy package;
  - runs the provider's (now mandatory) `verifyId`;
  - refuses any approve PTB that holds anything except `seal_approve*` calls to the policy package
    (`assertApproveOnly`).
- **Safe approve PTBs.** They are built transaction-kind-only and never signed.
- **Safe defaults.**
  - The threshold is validated against total weight.
  - Share-consistency checking is on.
  - SessionKeys are in memory, scoped to address and package, and cleared by the consumer on
    disconnect or account switch (sealed-storage-ui `seal.ts:95-104`).
  - The DEM key `@mysten/seal` returns from `encrypt` is discarded.
- **Discovery.** Events decode from BCS at the exact event type. Look-alike packages are rejected.
  Indexer reads use access-gate-client's shared reader.
- **Deployment IDs.** They are generated from the published Move records and drift-checked in CI.
  Identity layouts match the Move decoders through a shared vector.

**Measured (2026-10-09, 0.0.19):**

- **Hermetic checks:** **97/97** unit tests in 10 files (77 at the first pass). tsc, eslint,
  `npm audit --audit-level=high` (0) and `check:deployments` (matches `sealed-storage-sui@0.0.7`) are
  clean. Coverage was not re-measured (the coverage plugin is not installed); the 2026-10-03 figures
  (95.13% statements, 91.25% branches, 96.62% lines) are for the 77-test suite.
- **Live checks:** `SEAL_TESTNET=1 npm run test:integration` passes (3 files, 9 tests: ABI drift of every
  builder against the new package, event decoding, time-lock round trip over the independent servers).
  It now also runs weekly in CI (`live.yml`).

**Findings at the 2026-10-09 re-verification.** Everything the first pass recorded was fixed in
0.0.16–0.0.19 (decisions: soulbound-only sealing unless `allowTransferableGates`; legacy namespaces
unsupported; mainnet key servers Overclock / NodeInfra / H2O Open mode 2-of-3, Enoki dropped):

- **Resolved:** F6 (publisher filter, `gateOperators`, authenticity statement), F7 (gate id and linked-gate
  check), F8 (u64 bounds, past unlock), F9 (session margin, coalesced mints), F11 (README follows
  ADR-0002), F12 (`Object.hasOwn`), F14 (manifest and params validation), F15 (skip-and-count, scan cap),
  F17 (soulbound-only), F18 (declarations, `SECURITY.md`, CI parity), F19 (replace guard).
- **Mitigated:** F10 (hermetic `encrypt` tests and the weekly live run; the live nft-gate negatives remain
  and are maintainer-only; **since resolved 2026-10-22**), F13 (`verifiesKeyServers`; the SDK switch itself is unchanged).
- **Adjudicated:** F16 (legacy namespaces unsupported), F24 (the gate and soulbound checks are opt-in).
- **Since resolved (0.0.20, 2026-10-18):** F25 (`gateOperators` tests added) and F20 (the two doc residuals fixed). **0.0.21 (2026-10-20):** F26 (a stale indexer head page falls back to the full node). **0.0.23 (2026-10-22, local):** F27 (`SealController.explainRefusal` names the policy abort a key server's generic refusal hides; OQ5 decided).

What the first pass found, for the record:

1. **F6 (Medium) — discovered content is not authenticated.**
   - Seal encryption needs only public keys, so **anyone** can encrypt data to a gate's identity
     namespace `[gate id][nonce]`.
   - `sealed_content::publish` is permissionless.
   - `listSealedContent` returns every publisher's pointers for a gate. It offers no publisher filter
     and no helper to identify the gate's operator.
   - A spoofed pointer therefore **decrypts successfully** for pass holders and shows attacker
     content inside the gated UI, with every appearance of official content.
   - Nothing in the package says Seal gives confidentiality but not authenticity.
   - sealed-storage-ui lists pointers unfiltered today.
2. **Low:**
   - **F7:** `encrypt` does not validate the gate. An empty or `0x` id, a non-existent id, or a gate
     of a superseded `access_gate` package all produce content no one can ever decrypt.
   - **F8:** `u64beBytes` silently wraps values ≥ 2⁶⁴. A time-lock "unlock at 2⁶⁴" encodes 0, so the
     content is **immediately public**.
   - **F9:** the SessionKey cache's one-minute safety margin is measured from when the wallet signed,
     not from when the key was created. A slow signature breaks the documented invariant.
   - **F10:** `encrypt` has no unit test, so the original-id binding is unasserted. On testnet
     original-id equals published-at, so even the live round trip cannot catch a regression. The live
     suite has no nft-gate case and none of the negatives the SEAL lens requires.
   - **F11:** the README recommends a mainnet setup (one aggregator committee, t = 1, a browser API
     key) that contradicts ADR-0002, this package's own CLAUDE.md, and sealed-storage-ui.
   - **F12:** `sealPoliciesDeployment('constructor')` returns a prototype member.
3. **Info (F13–F20):**
   - `verifyKeyServers` is all-or-nothing;
   - manifest `id` and `params` are only shape-checked;
   - indexer and event robustness is inherited from access-gate-client (stale head pages fall back: F26);
   - content under superseded namespaces cannot be decrypted;
   - client-side options for the frozen-pass issue (sealed-storage-sui F16);
   - packaging and CI details;
   - the registry replaces providers silently;
   - documentation drift.

**Posture:** the cryptographic orchestration is careful and defence-in-depth checks are in place. The
edge work the first pass listed is done:

- discovery can be authenticated by publisher (F6), and sealed-storage-ui uses operator-only listing by default;
- inputs that seal content irrecoverably or openly are rejected (F7, F8, F17);
- the SessionKey margin counts from key creation (F9);
- `encrypt` is covered by hermetic tests that catch a namespace regression (F10).

What remains: live nft-gate decrypt negatives (needs a funded test wallet), the optional nature of the
gate checks (F24), and the mainnet items (publication, key-server terms, UpgradeCap custody, external
review). The first pass recorded findings only; the fixes are in 0.0.16–0.0.19 (see the re-verification
log).

---

## Threat model / trust boundaries

**Primary trust anchor:** the Seal key-server committee evaluating the on-chain `seal_policies`
package (`sealed-storage-sui-audit.md`). This package's job is to bind data to the right namespace and
identity, to ask for keys only for the identity the caller expects, and to keep the SessionKey on the
device.

### Seal trust matrix (SEAL lens, mandatory)

| Party | Power | Failure / abuse consequence | Bounded here by |
| --- | --- | --- | --- |
| Each key-server operator | derives keys for identities it approves | ≥ t colluding decrypt everything sealed to them; < t available ⇒ nobody decrypts (fails closed) | threshold validation; consumer's committee choice (B.SEAL-1); README follows ADR-0002 (F11) |
| Aggregator (testnet default) | relays key requests and responses | availability; cannot forge shares when consistency is checked | `checkShareConsistency` default `true`; `verifyKeyServers` off whenever an aggregator is present, visible through `verifiesKeyServers` (F13) |
| Policy UpgradeCap holder (`seal_policies`, the deploy key until the pre-mainnet custody step) | replaces `seal_approve*` | changes who may decrypt **existing** ciphertexts | disclosed in `SECURITY.md` "Trust assumptions" |
| Requester + wallet | signs the SessionKey personal message | the key server evaluates under the signer's address; one signature authorises key retrieval for **all** identities in the package for the TTL | address- and package-scoped cache; `clearSession`; margin (F9) |
| Key server's full node | chain view for the dry run | stale state; clock skew for time locks | out of scope (policy audit F26) |
| Storage (Walrus) | holds ciphertext | public ciphertext; substitution | header identity/package check (SEAL-M2); AEAD (AES-256-GCM, the SDK default) |
| **Publishers of discovery pointers** | label, blob id, seal id under any gate | spoofed pointers to attacker-encrypted content that decrypts successfully | gate-id filter plus the `publishers` filter and `gateOperators` (F6); the library default is unfiltered, sealed-storage-ui lists the operator's pointers only |
| **Anyone** | encrypt to any identity (public keys only) | content under a gate's namespace that the gate's operator never published | cannot be prevented (public keys); authorship comes from the publisher filter, and `SECURITY.md` states that Seal does not authenticate (F6) |
| Consuming app | registry contents, controller config, manifests | can register a hostile provider; supplies the committee | `assertApproveOnly` limits what a provider can put in the approve PTB; `register` refuses a silent replace (F19); `SECURITY.md` scopes app decisions out |

### On-chain dependency matrix (SUI_CLIENT lens)

| Object / package | ID (original-id · published-at) | Sourced from | Used as | If stale, wrong or attacker-supplied | Fails |
| --- | --- | --- | --- | --- | --- |
| `seal_policies` | `0x0c8f73…` · `0x0c8f73…` (v1) | `./deployments` (generated) | Seal namespace + SessionKey scope (original); approve/publish target (published-at) | wrong namespace ⇒ permanently undecryptable; retired published-at ⇒ `config::E_WRONG_VERSION` | closed |
| `PolicyConfig` | `0xee0403ba…` | `./deployments` | 2nd argument of every `seal_approve*`, 1st of `publish` | wrong object ⇒ dry run aborts | closed |
| `SealedContentPublished` | original-id | `sealedContentEventType` | exact normalised event filter + recheck | look-alike rejected (test) | closed |
| `access_gate` `Gate` (nft-gate) | caller-supplied gate id; type-checked at encrypt when `accessGateOriginalId` is set (F7; opt-in, F24) | params | identity prefix; approve object | non-existent or superseded-package gate ⇒ undecryptable forever; without the check nothing stops it | closed when configured |
| `access_gate` `AdminCap` (suggestions) | caller-supplied `accessGateOriginalId` | `createDefaultRegistry(id)` | lists gates the wallet administers | an id other than the package `seal_policies` links ⇒ suggests gates `nft_gate` cannot accept; the encrypt-time gate check then refuses them (F7) | closed |
| Clock `0x6` | `0x6` | literal | time-lock approve | — | — |

### Supply chain & input matrix (TS lens)

| Actor / source | What it controls | How the project bounds it |
| --- | --- | --- |
| Dependency authors | `@meddleware/access-gate-client` at runtime; SDK peers; ~150 dev packages | lockfile; `npm audit --audit-level=high` in CI and publish |
| Registry | tarballs | lockfile integrity; provenance on publish |
| `@meddleware/sealed-storage-sui` npm package | `Published.toml` / `deployments.json` → every ID | exact devDependency pin `0.0.7` (with provenance); HEX_ID validation; `check:deployments` in CI |
| Untrusted inputs: manifests, ciphertext bytes, event BCS, indexer bodies | shapes and sizes | `parseSealedManifest(raw, registry)` (hex id, registered type, provider-narrowed params, F14); `EncryptedObject.parse` + identity/package checks; BCS layout; shared indexer reader with skip-and-count (F15) |
| Embedding host | globals, SDK copies, registry | peer dependencies (one SDK copy); `SECURITY.md` scope |

---

## Severity scale

Critical / High / Medium / Low / Info / Positive (unchanged across the corpus).

## Scope

**In scope (tag `v0.0.19` = `3527c58`, 2026-10-09; HEAD `b4a42ea` adds one Dependabot bump; the first pass was at `bdd72c0` = `v0.0.15`):**

- `src/{index,types,bytes,registry,default-registry,manifest,controller,gate-check,operators,sealed-content,deployments}.ts`
- `src/providers/{nft-gate,timelock}.ts`
- `scripts/gen-deployments.mjs`
- `tests/**` (10 unit files, 3 integration files, `conformance-vectors.json`, `abi-table.ts`)
- `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest*.config.ts`, `eslint.config.ts`,
  `.gitignore`
- `README.md`, `SECURITY.md`, `CLAUDE.md`, `CHANGELOG.md`
- `.github/workflows/{node-ci,npm-publish,live}.yml`

**Cross-repo evidence (read-only):**

- `sealed-storage-sui` at `a03a532` (0.0.7; first pass: `0726070`): Move signatures, identity decoders,
  conformance literals, `Published.toml` / `deployments.json`.
- `sealed-storage-ui` (`src/config.ts` committee defaults; `src/seal.ts` `clearSession` wiring;
  `src/sealed-content.ts` operator-filtered discovery, `src/manifest-guard.ts`).
- `access-gate-client` 0.0.9 (`fetchOwnedGates`, `fetchGate`, `readIndexerEvents`).

**Out of scope:** Seal and `@mysten/seal` internals; the key servers; the Move package (own audit);
sealed-storage-ui (own audit; consumer facts cited); the read-indexer service.

**Environment / commands (2026-10-09, Node 24.13.0, existing `node_modules`; the first pass was
2026-10-03 on Node 22.22.2):**

| Command | Result |
| --- | --- |
| `npx vitest run` | **97 passed** (10 files) |
| `npx vitest run --coverage` | not re-run: the coverage plugin is not installed. First-pass figures (77 tests): 95.13% statements, 91.25% branches, 95.23% functions, 96.62% lines; `controller.ts:101-109` (`encrypt`) was uncovered then and is covered now (F10) |
| `npx tsc --noEmit` / `npx eslint .` | clean / clean |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `npm run check:deployments` | `src/deployments.ts matches @meddleware/sealed-storage-sui@0.0.7` |
| `SEAL_TESTNET=1 npm run test:integration` | **3 files, 9 tests passed** (ABI drift against the new package, `SealedContentPublished` decode, time-lock round trip over the independent servers) |
| `npm pack --dry-run` | 31 files, 29.9 kB: `src/**` (13), `dist/**` declarations (13), `CHANGELOG.md`, `README.md`, `SECURITY.md`, `LICENSE`, `package.json`. No tests or scripts. |
| `npm ls @mysten/sui @mysten/seal @mysten/bcs @meddleware/access-gate-client` | one copy each (2.35.0 / 1.4.19 / 2.1.2 / 0.0.8), deduped through access-gate-client |
| `npm view @meddleware/sealed-storage-client@0.0.19` | SLSA v1 provenance attestation present; `@meddleware/sealed-storage-sui@0.0.7` also attested (2026-10-18: `latest` is 0.0.20, published 2026-10-18T09:06Z, attestation present) |
| First-pass scratch probe (2026-10-03) | confirmed F7, F8, F12 and F14 against 0.0.15; each is now pinned by a hermetic test (see the findings) |

**Working tree:** clean apart from the untracked `docs/` directory holding this audit; `node_modules/` and `dist/` are git-ignored.

**Seal documentation basis (2026-10-03; not re-fetched):** the Sui docs `sui-stack/seal/using-seal` and `sui-stack/seal/sui-stack-seal`,
read via search summaries (direct fetch was blocked). They say:

- the approved package ID is the package's first published version;
- `seal_approve*` should be non-public `entry` functions;
- shared objects should be versioned;
- dry runs on key servers' full nodes can disagree while state propagates.

---

## Findings

### F2 — Per-policy nonce widths (corpus ID)

**Severity:** Info   **Disposition:** RESOLVED (carried from the corpus; re-verified 2026-10-09)

- nft-gate uses a 16-byte nonce and time-lock an 8-byte nonce; both are documented in `SECURITY.md`
  and the provider comments.
- The widths are locked by `tests/providers.test.ts` "nonce widths (F2)", including per-encryption
  uniqueness.
- They match the Move-side minimum lengths, and `verifyId` enforces the exact totals (48 and 16
  bytes).

### F4 — `hexToBytes` accepted non-hex input (corpus ID)

**Severity:** Low   **Disposition:** RESOLVED (carried; re-verified 2026-10-09)

`hexToBytes` throws on non-hex characters (`bytes.ts:7-9`). Test: `throws on non-hex characters (F4)`.

### F5 — Stored identity not cross-checked against decrypt params (corpus ID)

**Severity:** Low   **Disposition:** RESOLVED (carried; strengthened in 0.0.14; re-verified 2026-10-09)

- `verifyId` is now **required** on `SealPolicyProvider` (`types.ts:107`), and `decrypt` always calls
  it (`controller.ts:128`).
- nft-gate checks the exact 48-byte layout and the gate prefix (`nft-gate.ts:64-78`).
- time-lock checks the 16-byte layout (`timelock.ts:40-48`).
- Tests:
  - `nft-gate provider verifyId (F5 — id↔params cross-check)`;
  - `always runs the provider's verifyId before approving`;
  - `nft-gate verifyId layout`.

**Remediation / evidence (2026-10-09):** unchanged and green. `hexToBytes` still throws on non-hex
(`bytes.ts`); `verifyId` is required on every provider and `decrypt` calls it before the approve PTB
(`controller.ts:167`); the F2/F4/F5 tests are in the 97/97 run. The nft-gate `verifyId` also still checks
the exact 48-byte layout. Moved lines: the former `controller.ts:128` is now `:167`.

### F6 — Discovered sealed content is not authenticated: anyone can encrypt to a gate's namespace and publish a pointer that decrypts successfully

**Severity:** Medium   **Disposition:** RESOLVED (0.0.16, `affd00b`; the optional pointer-prefix check is ADJUDICATED; `gateOperators` is pinned by `tests/operators.test.ts`, F25)
**Where:**

- `src/sealed-content.ts:176-246` (`listSealedContent` filters by gate only);
- `SealedContentPointer.publisher` is exposed but never used;
- README "Sealed-content discovery";
- `SECURITY.md` (no authenticity statement).

Consumer: sealed-storage-ui `src/sealed-content.ts` lists them unfiltered.

**Issue:**

- Seal is identity-based encryption: encrypting needs only the key servers' public keys and the
  identity. Any party can therefore produce a valid ciphertext under `[gate id][nonce]` for any gate.
- `sealed_content::publish` is permissionless and does not check `gate_id` or the publisher.
- An attacker can:
  1. encrypt their own content to gate G's namespace;
  2. upload it to Walrus;
  3. publish a pointer for G with any label (for example "Official update").
- `listSealedContent` returns it among the gate's pointers.
- A pass holder decrypts it **successfully**, because the policy approves any identity under G.
- The UI then shows attacker-authored plaintext that passed the gate's decryption, which users will
  read as content from the gate's operator.
- The pointer type exposes `publisher`, but the package offers no filter and no helper to resolve the
  gate's operator: the `AdminCap` owner, via access-gate-client.

**Impact:** phishing or misinformation inside gated content, under a trust signal (successful
decryption) users reasonably treat as authentication. Confidentiality is unaffected. Spam pointers are
bounded on-chain (string limits) but not in number.

**Remediation / evidence:**

1. Add a `publishers?: string[]` filter (normalised) to `ListSealedContentOptions`.
2. Add a helper that resolves a gate's operator, for example `gateOperators(client, gateId)`
   returning the `AdminCap` owner and `payment_recipient` via access-gate-client. Make "operator-only"
   the documented default for UIs.
3. State in `SECURITY.md` and the README that Seal provides confidentiality, not authenticity: a
   successfully decrypted item proves only that it was sealed to the namespace, not who wrote it.
4. Optionally, validate a pointer's `sealId` prefix against its `gateId` for nft-gate content, and
   drop inconsistent pointers.
5. Add tests for each.
6. Bump sealed-storage-ui in the same release.

**Remediation / evidence (2026-10-09):**

- `listSealedContent({ publishers })` keeps only pointers whose normalised `publisher` is listed, on both
  the full-node and the indexer path (`sealed-content.ts` `publishedBy`).
- `gateOperators(client, gateId, accessGateOriginalId, extra?)` (`src/operators.ts`) reads the gate through
  access-gate-client `fetchGate` (exact type, so a look-alike gate throws) and returns its
  `payment_recipient` plus the caller's `extra` addresses, normalised and de-duplicated. `extra` exists
  because a pointer's `publisher` is whoever sent the transaction, which may be a separate publishing
  wallet.
- `SECURITY.md` invariant 4 and the README ("Seal gives confidentiality, not authenticity") state that a
  successful decrypt proves only that an item was sealed to the gate's namespace.
- sealed-storage-ui `src/sealed-content.ts` lists operator-only pointers by default (`gateOperators`); `includeOthers`
  is an explicit "every publisher" view. It consumes sealed-storage-client `^0.0.20` (was `^0.0.19`).
- Tests: `tests/sealed-content.test.ts` "lists only pointers published by the given addresses, on the full
  node and the indexer" and "compares publishers normalised, and lists everything when no filter is given".
- Remediation item 4 (drop a pointer whose `sealId` prefix differs from its `gateId`) was not implemented:
  ADJUDICATED. `decrypt` already runs `verifyId` against the pointer's `gateId`, so an inconsistent pointer
  fails closed at decrypt instead of showing content.
- The library default stays unfiltered by design: it cannot know a gate's publishing wallet, so the filter
  is the caller's choice and the documented default for UIs. `gateOperators` is pinned by `tests/operators.test.ts` (F25).

### F7 — `encrypt` does not validate the gate: empty, unknown or superseded-package gates make content permanently undecryptable

**Severity:** Low   **Disposition:** RESOLVED (0.0.16, `affd00b`; 0.0.18 adds the soulbound check; the gate check is opt-in, F24)
**Where:**

- `src/providers/nft-gate.ts:60-62` (`buildId` → `objectIdBytes(params.gateId)`);
- `src/bytes.ts:26-33`;
- `src/controller.ts:100-110`;
- `src/default-registry.ts:13` (the suggestions' `accessGateOriginalId` is caller-supplied).

**Issue:**

- `objectIdBytes('')` and `objectIdBytes('0x')` return 32 zero bytes, so `buildId({ gateId: '' })`
  namespaces content to gate `0x0` (probe-verified).
- Any well-formed id is accepted without reading the object, including:
  - a typo;
  - a non-gate object;
  - a **`Gate` of a superseded `access_gate` package** (`0x1a81ca…`, `0x0bedd0…`), whose gates still
    exist on testnet, including the former relay gates.
- `seal_policies` `0x61c4aa…` links `access_gate` `0xa55789…`, so `nft_gate::seal_approve` can never
  take another package's `Gate` type.
- The nft-gate `suggest()` uses whatever `accessGateOriginalId` the app passes. Nothing ties it to the
  `access_gate` that `seal_policies` links. They agree today (both `0xa55789…`) only because both repos
  were released together.

**Impact:**

- Encrypting and uploading succeed, but no one, including the owner, can ever decrypt.
- There is no error until a holder tries, possibly much later.
- This is a time-lock-style "seal forever" trap with no warning.

**Remediation / evidence:**

1. In `encrypt` for nft-gate, or as a provider pre-check, require a non-empty id.
2. Read the object and require its type to equal `<linked access_gate original id>::access_gate::Gate`.
3. Record that linked original id in `./deployments`. The generator can read it from the pinned
   `access_gate` dependency, or `sealed-storage-sui` can add it to `deployments.json`.
4. Make `suggest()` use it rather than a caller-supplied id.
5. Fail encryption on mismatch.
6. Add tests for an empty id, a non-gate object and a look-alike-package gate.

**Remediation / evidence (2026-10-09):**

- The nft-gate provider refuses an empty, `0x`-only, non-hex or all-zero gate id (`nft-gate.ts`
  `requireGateId`; test "nft-gate refuses an empty, 0x-only, non-hex or zero gate id").
- With `SealControllerConfig.accessGateOriginalId` set, `encrypt` for `nft-gate` reads the gate first and
  requires its type to be `<access_gate original id>::access_gate::Gate` (`gate-check.ts`
  `assertLinkedGate`, normalised full-type comparison; test "reads the gate first and refuses one that is
  not a Gate of the linked access_gate package"). A typo, a non-gate object and a gate of a superseded
  `access_gate` package (`0xa55789…` and older) are refused before anything is sealed. sealed-storage-ui passes
  `accessGateOriginalId` (`src/seal.ts`).
- Not implemented: remediation items 3 and 4 (record the linked `access_gate` id in `./deployments`;
  derive `suggest()` from it). The id is still caller-supplied, and the generator does not know it. A wrong
  id fails closed (the check refuses a valid gate) rather than sealing forever. Since the check is only
  made when the id is configured, see F24.

### F8 — `u64beBytes` wraps values ≥ 2⁶⁴; a time lock can silently become "already unlocked"

**Severity:** Low   **Disposition:** RESOLVED (0.0.16, `affd00b`)
**Where:** `src/bytes.ts:36-45` (no upper bound); `src/providers/timelock.ts:4-7, 33-38`
(`unlockMs?: number`; past times accepted).

**Issue:**

- `u64beBytes` rejects negatives but not values ≥ 2⁶⁴. It keeps the low 8 bytes, so:
  - `2n**64n` encodes as `0`;
  - `2n**64n + 1000n` encodes as `1000`.
- `timeLockProvider.buildId({ unlockMs: 2 ** 64 })` therefore produces unlock time 0. The content is
  decryptable by anyone immediately (probe-verified).
- `unlockMs` is a `number`, so values above 2⁵³ are already imprecise. TS-M3 and SC-M4 call for
  `bigint`.
- An unlock time in the past is accepted silently: content intended to be locked is public as soon as
  it is stored.

**Impact:**

- Any input path that produces a huge or wrapped value turns a time lock into no lock. This is a
  fail-open encoding error for a confidentiality primitive.
- The sealed-storage-ui datetime input bounds this in practice; library callers have no guard.

**Remediation / evidence:**

1. Make `u64beBytes` throw for values > `2n**64n - 1n` and for non-integer or unsafe numbers.
2. Type `unlockMs` as `number | bigint`, requiring safe integers.
3. Have `buildId` reject `unlockMs` ≤ `Date.now()` unless the caller opts in (for example
   `allowPast: true`, used by the integration test).
4. Add boundary tests: 2⁶⁴ − 1 accepted, 2⁶⁴ rejected, a past time rejected.

**Remediation / evidence (2026-10-09):** `u64beBytes` throws for a negative value, a number that is not a
safe integer and any value above 2⁶⁴ − 1 (`bytes.ts`); `unlockMs` is `number | bigint`;
`timeLockProvider.buildId` rejects an unlock time at or before `Date.now()` unless `allowPast: true`.
Tests: `tests/bytes.test.ts` "rejects u64 values that would wrap, go negative or lose precision"
(2⁶⁴ − 1 accepted, 2⁶⁴ and 2⁶⁴ + 1000 rejected) and `tests/providers.test.ts` "refuses an unlock time that
would wrap, or that has already passed". The Move side is unchanged: a past unlock time is still valid
on-chain, so the guard is client-side by design.

### F9 — The SessionKey cache margin is measured from the signature, not from key creation

**Severity:** Low   **Disposition:** RESOLVED (0.0.16, `affd00b`)
**Where:** `src/controller.ts:170-189`.

**Issue:**

- `SessionKey.create(…ttlMin…)` starts the key's lifetime when it is created. Per `@mysten/seal`, the
  creation time is fixed then and bound into the signed personal message.
- The controller awaits the wallet signature, which can take minutes while the user reads the prompt.
- It then caches the key with `expiresAt = Date.now() + (ttlMin − 1) min`.
- So if signing takes longer than one minute, the cache believes the key is valid after it has expired
  server-side, and hands an expired key to the key servers.
- This contradicts `SECURITY.md` invariant 2: "They expire at least one minute before the server-side
  TTL."
- Two concurrent `decrypt` calls with no cached key each create a key and each prompt the wallet.

**Impact:**

- Decrypt failures, with no automatic re-mint, until the cache entry expires.
- Duplicate wallet prompts.
- Availability and UX only; the key servers enforce the real expiry.

**Remediation / evidence:**

1. Capture `const created = Date.now()` before `SessionKey.create`, and set
   `expiresAt = created + (ttlMin − 1) min`. Alternatively, check `key.isExpired()` (the SDK API) at
   use.
2. Coalesce concurrent mints per cache key with an in-flight promise.
3. Add tests with fake timers.

**Remediation / evidence (2026-10-09):** `mint` records `createdAt = Date.now()` before
`SessionKey.create` and expires the cache entry at `createdAt + (ttlMin − 1) min` (`controller.ts:222-235`).
Concurrent decrypts for the same address and package share one in-flight mint through the `minting` map,
which is cleared in `finally`, so there is one wallet prompt. Tests: `tests/controller.test.ts` "counts the
early-expiry margin from key creation, not from when the slow signature returns" and "concurrent decrypts
share one mint and one wallet prompt". `SECURITY.md` invariant 2 now holds as written.

### F10 — `encrypt` is untested hermetically; the live suite cannot detect a namespace regression and lacks nft-gate and negative cases

**Severity:** Low   **Disposition:** RESOLVED (hermetic `encrypt` tests 0.0.16; weekly live run 0.0.17; the funded nft-gate round trip with negatives ran on 2026-10-22 and is a maintainer-run test, `tests/integration/nft-gate.integration.test.ts`, commit 10b6bb0)
**Where:**

- `src/controller.ts:100-110` (0% covered);
- `tests/controller.test.ts` (mocks `SealClient.encrypt` but never calls it);
- `tests/integration/timelock.integration.test.ts` (time-lock only);
- `.github/workflows/node-ci.yml` (no integration job).

**Issue:**

- The single most important binding in the package is `encrypt`'s `packageId: this.cfg.originalId`,
  and no hermetic test asserts it.
- The live round trip runs on testnet, where original-id equals published-at, so a regression to
  `publishedAt` would still pass there.
- After the first upgrade, that regression would make every newly sealed item permanently
  undecryptable.
- The SEAL lens §C requires a live decrypt round trip **with negatives**: wrong gate, exhausted or
  missing pass, too early, wrong package namespace, paused gate. Only "too early" exists.
- No live nft-gate case exists at all.

**Impact:** the package's core guarantees are proven only by reading the code.

**Remediation / evidence:**

1. Add unit tests that `encrypt` calls `SealClient.encrypt` with `packageId === originalId` and the
   configured threshold when `originalId ≠ publishedAt` (mirroring the existing "after a package
   upgrade" decrypt test).
2. Add live nft-gate cases on testnet: a funded test wallet holding a pass for a test gate; decrypt OK
   with that pass; wrong gate refused; exhausted pass refused; a non-holder refused.
3. Run the live suite on a schedule (read-only key retrieval; no funds beyond a test wallet's pass).

**Remediation / evidence (2026-10-09):**

- Hermetic: `tests/controller.test.ts` "encrypt binds to the original id (not published-at) and the
  configured threshold" / "after a package upgrade the namespace is still the ORIGINAL id" asserts
  `packageId === originalId` and the threshold when `originalId ≠ publishedAt`. `encrypt` is now covered,
  including the gate and soulbound checks (F7, F17).
- Scheduled live run: `.github/workflows/live.yml` (Mondays 05:47 UTC and on dispatch; read-only, no
  secrets) runs `npm run test:integration` (added in 0.0.17, `cfd4a5e`). It passed locally on 2026-10-09:
  3 files, 9 tests.
- Still missing at 2026-10-09: a live nft-gate decrypt round trip with negatives (wrong gate, exhausted or missing pass,
  wrong namespace, paused gate). **Done 2026-10-22:** `tests/integration/nft-gate.integration.test.ts` (8 tests, passed against the public
  testnet committee, run twice) creates its own scratch gates on the live `access_gate` with a funded key (`SEAL_LIVE_KEY_FILE`; it skips
  without one, so the weekly job is unchanged) and covers: the positive round trip; a non-owner (`InvalidParameterError`); a pass of another gate
  (`E_WRONG_GATE`); an exhausted pass (`E_EXHAUSTED`); a paused gate whose policy blocks decryption (`E_GATE_PAUSED`), refused and then resumed; an
  identity not namespaced to the gate (`E_ID_NOT_NAMESPACED`: refused by the controller before any request, and the dry run aborts); a time-lock that
  has not opened (`E_TOO_EARLY`); and the frozen transferable pass (sealed-storage-sui F16: a stranger decrypts). It is maintainer-run by design:
  a funded key must not be a CI secret (README, `OPERATOR_TASKS.md`). Digests: the sealed-storage-sui audit log entry of 2026-10-22.

### F11 — The README's mainnet guidance contradicts ADR-0002 and the package's own invariants

**Severity:** Low   **Disposition:** RESOLVED (0.0.16, `affd00b`)
**Where:** `README.md:73-76`:

> "On mainnet, use the verified committee behind the Mysten mainnet aggregator at `threshold: 1`;
> that aggregator needs an Enoki API key, passed per server as `{ apiKeyName: 'X-API-Key', apiKey }`."

**Issue:** This contradicts three other sources:

- `CLAUDE.md`: "an API key in a browser bundle is public: MeddleWare's apps use keyless servers only
  (workspace ADR-0002 — mainnet is three Open-mode servers at threshold 2)";
- sealed-storage-ui's mainnet defaults (three independent operators, t = 2);
- the SEAL lens (confidentiality beyond one operator needs ≥ 2 independent operators).

Following the README gives:

- a single client-side server (one committee, one aggregator operator);
- `verifyKeyServers` off (F13);
- an API key shipped to every browser.

**Impact:** integrators following the published README (also the docs-site source) would deploy a
weaker configuration than the one the project chose.

**Remediation / evidence:** Rewrite the paragraph to match ADR-0002:

- independent keyless servers, t ≥ 2;
- if an aggregator-backed committee is used, the confidentiality claim rests on the committee's
  internal threshold, and the API key is public.

**Remediation / evidence (2026-10-09):** the README paragraph (now `README.md:73-80`) follows ADR-0002:
an aggregator-backed committee counts as one server, MeddleWare's apps use independent keyless servers at
`threshold: 2` (three Open-mode servers on mainnet: Overclock, NodeInfra, H2O Nodes), and an API key in a
bundle is public. It matches `CLAUDE.md` and sealed-storage-ui's defaults.

### F12 — `sealPoliciesDeployment(network)` returns prototype members for keys like `constructor`

**Severity:** Low   **Disposition:** RESOLVED (0.0.16, `affd00b`)
**Where:** `src/deployments.ts:33-37`, generated by `scripts/gen-deployments.mjs:93-97`.

**Issue / Impact:**

- `sealPoliciesDeployment('constructor')` returns `Object`, a truthy function with `originalId`
  undefined (probe-verified), instead of throwing.
- A misconfigured network name then builds a controller that encrypts with `packageId: undefined`, and
  approve targets of `undefined::…`.
- This is SC-M5 ("empty IDs for a network throw").

**Remediation / evidence:** use `Object.hasOwn` in the generator template; regenerate; add a test.

**Remediation / evidence (2026-10-09):** `sealPoliciesDeployment` uses `Object.hasOwn` (`deployments.ts`),
emitted by the generator, so `check:deployments` pins it. Test: `tests/deployments.test.ts` "does not
resolve Object prototype members as networks" (`constructor`, `toString`, `__proto__`).

### F13 — `verifyKeyServers` is all-or-nothing: one aggregator entry disables verification of the independent servers too

**Severity:** Info   **Disposition:** MITIGATED (0.0.17, `cfd4a5e`; the SDK switch itself is unchanged)
**Where:** `src/controller.ts:89`.

**Issue:**

- The SDK option is global. The default turns it off when *any* server has an `aggregatorUrl`.
- sealed-storage-ui's testnet default (one aggregator plus two independent Mysten servers) therefore runs with
  no URL verification for the two independent servers.
- Mainnet defaults (no aggregator) keep it on.

**Impact:** a look-alike server object for an independent server would not be caught on mixed
configurations. Today this is testnet only.

**Remediation / evidence:**

- Document the SDK constraint in the README and the `SealControllerConfig` doc.
- Optionally warn at construction when a mixed configuration disables verification.
- If the SDK gains per-server verification, use it.

**Remediation / evidence (2026-10-09):** `SealController.verifiesKeyServers` exposes the effective setting,
and the README, `SECURITY.md` ("Key servers") and the config docs state that a mixed configuration runs
without URL verification for the independent servers. A construction-time warning was not added (the
S6 option). sealed-storage-ui's testnet default (aggregator plus two independent servers) is still mixed and
therefore unverified; the mainnet default (three independent servers, no aggregator) verifies. Revisit if
`@mysten/seal` gains per-server verification.

### F14 — `parseSealedManifest` checks shape only

**Severity:** Info   **Disposition:** RESOLVED (0.0.17, `cfd4a5e`)
**Where:** `src/manifest.ts:32-67`.

**Issue:**

- `id` is any non-empty string; non-hex is caught later in `decrypt` (fail closed).
- `params` is passed through untyped:
  - `params.soulbound: "false"` (a string) is truthy and selects `seal_approve_soulbound`, which then
    fails at build;
  - `params.gateId` is not checked against the id prefix until `verifyId`.
- Keys such as `__proto__` from `JSON.parse` stay as own properties. That is harmless as used.

**Impact:** clear errors arrive late rather than at import. No confidentiality impact: every bad
value fails closed.

**Remediation / evidence:**

- Validate `id` as even-length hex.
- Validate `policyType` against the registry when one is supplied.
- Provide per-provider `parseParams`, for example nft-gate requiring a 0x-hex `gateId` and a boolean
  `soulbound`.

**Remediation / evidence (2026-10-09):** `parseSealedManifest` requires `id` to be even-length hex. Given a
registry (`parseSealedManifest(raw, registry)`), `policyType` must be registered and the provider's
`parseParams` validates and narrows `params`: nft-gate requires 0x object ids and a boolean `soulbound`
and keeps only known keys (`__proto__` is dropped). Tests: `tests/manifest.test.ts` "requires the identity
to be even-length hex", "with a registry: checks the policy type and lets the provider validate and narrow
the params", "drops unknown params keys (including __proto__) when a provider narrows them", "accepts a
time-lock manifest, which has no params to check". sealed-storage-ui's `manifest-guard.ts` passes its registry.
Without a registry the guard is still shape-only plus hex `id`, by design.

### F15 — Discovery robustness inherited from access-gate-client

**Severity:** Info   **Disposition:** RESOLVED (0.0.17, `cfd4a5e`; reader fixes arrive through `access-gate-client` ^0.0.9)
**Where:** `src/sealed-content.ts:105-124, 222-246`.

**Issue:**

- `parseSealedContentEvent` throws on undecodable BCS, so one bad indexer row fails the page.
- An indexer cursor page has no fallback by design, so one bad row breaks pagination.
- The shared reader's bounds still apply: body read before the cap, redirects followed, `path`
  resolution.
- `listFromRpc` scans up to `maxPages × 50` events of **all** gates per call. With a popular package
  that is up to 1,000 events per page request.

**Remediation / evidence:**

- Skip and count undecodable indexer rows.
- Pick up the access-gate-client fixes.
- Document the scan cost, and cap `maxPages`.

**Remediation / evidence (2026-10-09):** `listSealedContent` skips and counts a row that does not decode
(`page.skipped`) on both the full-node and indexer paths, and clamps the full-node scan to
`MAX_RPC_PAGES = 20` pages of 50 events whatever `maxPages` says. Tests: `tests/sealed-content.test.ts`
"skips and counts a row that does not decode instead of failing the page", "does the same on an indexer
page", "caps the full-node scan at 20 pages whatever maxPages says". The shared reader's bounds
(https-only, timeout, body cap, checked page shape) come from `@meddleware/access-gate-client` `^0.0.9`;
its own findings are tracked in `access-gate-client-audit.md`.

### F16 — Content sealed under superseded `seal_policies` namespaces cannot be decrypted with this package

**Severity:** Info   **Disposition:** ADJUDICATED (decision: legacy namespaces are unsupported; `SECURITY.md` "Only the current policy package decrypts")
**Where:** `src/deployments.ts` (current package only); `src/controller.ts:175-177` (refuses other
packages); `SealedManifest` (no package field).

**Issue:**

- Content sealed under `0x42cc18…` or `0x9f0563…` needs a controller configured with those ids.
- The ids are not exported, and the manifest does not record the namespace, so an app cannot route
  such content.
- CHANGELOG 0.0.11 acknowledges this.
- `sealed-storage-sui`'s overview says such content "still decrypts".

**Remediation / evidence:**

- Either add a `namespace` (original-id) to new manifests and export a `legacy` deployments table,
- or declare legacy content unsupported in the docs.

**Remediation / evidence (2026-10-09):** the second option was chosen, by decision. `SECURITY.md` ("Trust
assumptions") states that a controller serves only the one configured `originalId`, that the manifest
records no namespace, and that pre-v0.2 packages are republished rather than migrated; CHANGELOG 0.0.17
repeats it. The superseded `seal_policies` packages (`0x61c4aa…` and older) are immutable and the live one
is `0x0c8f7349…`, so no `legacy` deployments table or manifest `namespace` field is planned (S3 dropped).
The README's `describeCiphertext` + `sealedUnderServers` flow still re-seals content onto new servers
under the current package.

### F17 — No client-side mitigation for frozen transferable passes (`sealed-storage-sui-audit.md` F16)

**Severity:** Info here (Medium in the policy audit)   **Disposition:** RESOLVED (0.0.18, `f8d6a13`; decision: soulbound-only sealing; the check is opt-in, F24)
**Where:** `src/providers/nft-gate.ts` (seals to any gate, transferable or soulbound, without notice).

**Issue:** any holder of a transferable pass can freeze it, and from then on anyone can decrypt all of
that gate's content. The provider neither warns nor refuses when the target gate mints transferable
passes.

**Remediation / evidence:** depends on OQ9. Options:

- (a) `encrypt` reads the gate (F7) and refuses or warns when `soulbound` is false;
- (b) a soulbound-only provider, if a soulbound-only Move policy is added.

**Remediation / evidence (2026-10-09):** option (a) was implemented as a refusal. With `accessGateOriginalId`
set, `encrypt` for `nft-gate` reads the gate (`include: { json: true }`) and refuses unless
`json.soulbound === true`, unless the caller passes `allowTransferableGates: true` (`gate-check.ts`
`assertLinkedGate({ requireSoulbound })`, `controller.ts:134`). The check stays valid after sealing because
the republished `access_gate` makes a gate's pass kind immutable (E15/E16). Tests: `tests/controller.test.ts`
"refuses a gate that mints transferable passes (a holder can freeze one into public access)" and "seals to
a soulbound gate, and to a transferable one only when asked to". Documented in the README and `SECURITY.md`
("Seal to soulbound gates"). The `seal_policies` side of this issue is tracked in
`sealed-storage-sui-audit.md`.

### F18 — Packaging and CI details

**Severity:** Info   **Disposition:** RESOLVED (0.0.16–0.0.17; `engines.node >=24` added in 0.0.20)
**Where:** `package.json`; `.github/workflows/*.yml`.

- **No declarations.** No `.d.ts` and no `types` condition, unlike access-gate-gateway-client and
  access-gate-client (declaration-only builds). Consumers must type-check the shipped source with
  compatible compiler settings. Acceptable for Vite consumers; inconsistent across the workspace.
- **`SECURITY.md` not shipped.** It is not in `files`, so the trust-assumptions statement does not
  reach npm consumers.
- **`--if-present`.** `npm-publish.yml` runs type-check, test and build with `--if-present`; `build`
  does not exist. There is no lint in the publish verification, and no `engines` field.
- **No live suite in CI.** The integration suite (ABI drift, event decoding, timelock round trip) never
  runs in CI (F10).
- **SDK floor.** `@mysten/seal` 1.4.18 is available; the peer floor is 1.4.17.
- **Stale CLAUDE.md.** It says the access-gate-client dependency is `^0.0.2`; it is `^0.0.4`.

**Remediation / evidence:**

- Add `SECURITY.md` to `files`.
- Drop `--if-present`.
- Reuse `node-ci.yml` (with lint) as the publish verification.
- Schedule the live suite.
- Decide whether to ship declarations (OQ4).

**Remediation / evidence (2026-10-09):**

- **Declarations:** 0.0.16 ships `.d.ts` in `dist/` (`tsconfig.build.json`, `prepublishOnly` builds) with a
  `types` condition on every export. OQ4 is answered: ship declarations.
- **`SECURITY.md`** is in `files` (0.0.17); `npm pack --dry-run` shows it.
- **CI parity:** `npm-publish.yml` calls `node-ci.yml` as its `verify` job (audit, `check:deployments`,
  type-check, lint, test, build, package-contents check); no step uses `--if-present`.
- **Live suite:** weekly `live.yml` (F10).
- **SDK floor:** `@mysten/seal` `^1.4.18`; `@mysten/sui` `^2.33.2` (the workspace floor, while the
  ADR-0001 text still names `^2.33.1`).
- **`engines`:** absent at 0.0.19 (first ADJUDICATED as the siblings did not declare it). Fleet decision D41
  (2026-10-10) sets `engines.node` to `>=24` for SDK/library packages; added in 0.0.20 (`package.json`,
  lockfile root entry). CI already runs Node 24.
- **CLAUDE.md** dependency version: fixed in 0.0.20 (F20).

### F19 — `PolicyRegistry.register` silently replaces an existing provider

**Severity:** Info   **Disposition:** RESOLVED (first ADJUDICATED as documented behaviour; 0.0.17, `cfd4a5e`, now refuses a silent replace)

**Issue:** registering a second provider with the type `nft-gate` replaces the built-in one without
notice.

**Mitigations already in place:**

- The controller still enforces `assertApproveOnly` and the ciphertext identity and package checks, so
  a replaced provider cannot add foreign calls or target other packages.
- It can, however, change identity construction at encrypt time.

**Remediation / evidence:** optionally add `register(provider, { replace: true })` and throw by
default.

**Remediation / evidence (2026-10-09):** `PolicyRegistry.register(provider, { replace: true })`; a second
provider for a registered type throws unless `replace` is passed (`registry.ts`). Test:
`tests/registry.test.ts` "refuses a second provider for a registered type unless replace is explicit".
`assertApproveOnly` and the ciphertext checks still bound what a replaced provider can do.

### F20 — Documentation drift

**Severity:** Info   **Disposition:** RESOLVED (0.0.17; the two residuals fixed in 0.0.20, commit `48fd9d6`)

- **`SECURITY.md` "Security model":** invariant 5 follows the nonce-width subsection, so the numbered
  list is split and renders as a new list.
- **`src/controller.ts:192`:** a stray doc comment ("Lower-case, `0x`-prefixed…") sits above
  `assertApproveOnly`'s own doc block. It belongs to `normalizeHexId`.
- **`SealController.decrypt` doc** (`:112-116`) does not mention the checks it performs before
  requesting keys: `verifyId`, header identity and package, approve-only.
- **README mainnet paragraph:** F11.
- **`CLAUDE.md`:** the access-gate-client version (F18).

**Remediation / evidence:** correct each.

**Remediation / evidence (2026-10-09):**

- Fixed in 0.0.17: the `SECURITY.md` list renders as one list; the stray doc comment now sits on
  `normalizeHexId`; the `decrypt` doc lists the checks made before requesting keys; the README mainnet
  paragraph follows ADR-0002 (F11).
- Residual: `CLAUDE.md` still says the `@meddleware/access-gate-client` dependency is `^0.0.7`
  (`package.json` has `^0.0.8`).
- Residual: the `SECURITY.md` source numbers its invariants 1–4, 6, 7 (it renders 1–6).

**Remediation / evidence (2026-10-18):** 0.0.20 sets the `CLAUDE.md` access-gate-client range to `^0.0.9` (the
`package.json` range after the bump) and numbers the `SECURITY.md` invariants 1-6 in the source. The audit's
citations of invariants 1, 2 and 4 are unchanged; no test pins documentation text.

### F21 — Positive: encryption binding and pre-request ciphertext checks

**Severity:** Positive

- `encrypt` uses `packageId: originalId` (`controller.ts:139`).
- The SessionKey is scoped to `originalId` (`:229`), and the cache key includes it (`:205`).
- Approve targets come from `publishedAt` (`:181`).
- **Before requesting any key share, `decrypt`:**
  - requires even-length hex;
  - runs `verifyId` (`:167`);
  - parses the ciphertext header and refuses a different identity or package (`:171-177`);
  - builds the PTB transaction-kind-only (`:183`) after `assertApproveOnly` (`:182`, defined at `:247`).
- The PTB is never signed or executed (SEAL-M1, M2, M3; SC-M8).
- Tests:
  - `refuses to decrypt a ciphertext sealed to a different identity`;
  - `… under another policy package`;
  - `… under the published-at id instead of the original`;
  - `refuses an approve PTB with anything but seal_approve* calls to the policy package`;
  - since 0.0.16, `encrypt` is covered too: `after a package upgrade the namespace is still the ORIGINAL id`.

### F22 — Positive: key and session hygiene

**Severity:** Positive

- The threshold must be an integer in `[1, total weight]`.
- `checkShareConsistency` defaults to `true`.
- `verifyKeyServers` defaults to `true` for independent servers.
- The DEM key `@mysten/seal` returns from `encrypt` is discarded: only `encryptedObject` is
  destructured.
- Sealing to a gate that mints transferable passes is refused by default (F17).
- SessionKeys:
  - are memory-only and never exported;
  - have a TTL ≥ 2 minutes (the SDK caps the maximum), with the early-expiry margin counted from key creation (F9);
  - are scoped to address and package;
  - can be cleared with `clearSession`, which sealed-storage-ui calls on disconnect and account switch.
- Nonces come from `crypto.getRandomValues`.

### F23 — Positive: IDs, discovery decoding and release chain

**Severity:** Positive

- **Generated IDs.** `./deployments` is generated from the exactly pinned, provenance-attested
  `@meddleware/sealed-storage-sui@0.0.7`, with HEX_ID validation and `check:deployments` in CI and in
  the publish verification.
- **Exact event decoding.** Events decode from BCS at the exact normalised type, and look-alike
  packages are rejected (test).
- **Bounded indexer reads.** The indexer goes through the shared https-only, timeout-bounded,
  size-capped reader, with first-page fallback and source-bound cursors.
- **Publish limits mirrored.** `publish` limits mirror the Move constants in UTF-8 bytes (test).
- **ABI coverage.** The ABI table covers every exported builder and every default provider.
- **Strict TypeScript.** `strict` plus `noUncheckedIndexedAccess`.
- **Single SDK copy.** SDKs are peer dependencies.
- **Release chain.** Actions are SHA-pinned; least-privilege `permissions`; OIDC `--provenance`
  (verified for 0.0.19 and 0.0.20); tag == version; idempotent publish; the tag workflow runs the full CI workflow
  first; a weekly live testnet run.

### F24 — The gate-type and soulbound checks at `encrypt` run only when `accessGateOriginalId` is configured

**Severity:** Info   **Disposition:** ADJUDICATED (decision: `encrypt` reads chain state only when the app opts in; answers OQ2)
**Where:** `src/controller.ts:131-135` (the check is skipped when `accessGateOriginalId` is unset or the params carry no string `gateId`); `src/default-registry.ts:13` (`accessGateOriginalId = ''`).

**Issue:**

- A `SealController` built without `accessGateOriginalId` does no gate-type or soulbound check: it
  encrypts to any non-zero well-formed gate id, as before 0.0.16. The soulbound-only decision (F17) and the
  linked-gate check (F7) therefore hold for configured callers only.

**Impact:** a library caller that skips the option can still seal content nobody can decrypt (a wrong or
superseded gate) or content that a transferable-pass holder can open to everyone. The caller's app decides
this; the project's own app (sealed-storage-ui) configures the option from the `access_gate` deployment.

**Remediation / evidence:** ADJUDICATED. `encrypt` needs only the key servers' public keys today; making
the full-node read mandatory would add a dependency on a full node to every nft-gate encryption. The option and its effect are documented (README, `SECURITY.md`, config docs).
Revisit if a consumer other than sealed-storage-ui appears: a `requireGateCheck` switch that throws when the option
is missing would close the gap without making the read the default.

### F25 — `gateOperators` has no hermetic test

**Severity:** Low   **Disposition:** RESOLVED (0.0.20, commit `48fd9d6`)
**Where:** `src/operators.ts`; `tests/` (no reference to `gateOperators`).

**Issue:**

- `gateOperators` is the F6 remediation helper and sealed-storage-ui's default discovery path. The unit suite does not
  call it: the publisher filter is tested with literal addresses (`tests/sealed-content.test.ts`), and
  sealed-storage-ui's tests mock the function.
- The `fetchGate` read it relies on is tested in access-gate-client, but this wrapper's own behaviour
  (throws for a non-`Gate`, de-duplicates and normalises, merges `extra`) is unpinned.

**Impact:** a regression could list too few operators (the UI shows nothing) or, if the recipient were
dropped from the set, too many publishers. Authorship is already out of the confidentiality path, and the
live weekly run does not cover it.

**Remediation / evidence:** add a test with a stubbed client: a gate of the linked package returns its
`payment_recipient` plus normalised `extra` without duplicates; a look-alike gate and a missing object
throw.

**Remediation / evidence (2026-10-18):** `tests/operators.test.ts` (6 tests, stubbed `core.getObject`): the
gate's `payment_recipient` is returned (short ids normalised); `extra` is merged normalised and de-duplicated
with the recipient first; a look-alike package, another type, an untyped object and a mistyped
`payment_recipient` throw; a missing object propagates; and the result used as `publishers` keeps the
operator's pointer and drops a rogue publisher's. Shipped in 0.0.20.

---

### F26 — A stuck indexer that still answers `200` shows frozen discovery (stale head pages were used)

**Severity:** Low   **Disposition:** RESOLVED (0.0.21, 2026-10-20, commit 8d3f8e6; the check is access-gate-client F25 / sui-indexer F19)
**Where:** `src/sealed-content.ts::listFromIndexer` (calls the shared `readIndexerEvents`).

**Issue:**

- sui-indexer stamps head pages with `polledAt`. `listSealedContent` fell back to the full node on errors and
  timeouts only, so an indexer with a stuck ingest kept answering `200` and sealed-storage-ui listed frozen pointers
  until it recovered (F15's reader fixes did not cover freshness).

**Impact:** stale discovery (new pointers missing) for as long as an ingest failure lasts. Display only: decryption
is authorised on-chain and the pointers stay unauthenticated either way (F6).

**Remediation / evidence (2026-10-20, 0.0.21, commit 8d3f8e6):**

- No new logic here: the shared reader treats a head page (no `before`) whose `polledAt` is missing, `null`,
  not an epoch-ms integer or older than `STALE_AFTER_MS` (60 s = 4 poll intervals) by the client's `Date.now()`
  as unavailable, so the existing first-page fallback runs and `indexerError` says `indexer is stale…`. A
  `polledAt` up to `CLOCK_SKEW_TOLERANCE_MS` (5 min) in the future counts as fresh. Pages with a cursor are immutable
  history and not checked. `IndexerSource.staleAfterMs` overrides the limit. The dependency is raised to
  `@meddleware/access-gate-client` `^0.0.10`, which contains the check (access-gate-client audit F25).
- Tests (`tests/sealed-content.test.ts`, *a stale head page counts as unavailable (sui-indexer F19, inherited from
  access-gate-client)*, faked clock): fresh page used; exactly 60 s used and 60 s + 1 ms falls back (the
  `listEvents` spy proves the full-node fallback ran and the pointers come from it); `null` and missing `polledAt`
  fall back; +60 s and +5 min used, +5 min + 1 ms falls back; an older page ignores staleness; `staleAfterMs`
  override. The existing indexer fixtures carry a fresh `polledAt`.
- Found while closing sui-indexer F19.

### F27 — A key server's refusal carries no Move abort, so `classifyPolicyAbort` cannot read a failed `decrypt` (found by the 2026-10-22 live run)

**Severity:** Info   **Disposition:** RESOLVED (0.0.23, commit 10b6bb0: `SealController.explainRefusal` / `explainApproveRefusal`, `src/refusal.ts`; `tests/refusal.test.ts`, 61 tests; asserted live by `tests/integration/nft-gate.integration.test.ts`, 8/8 on 2026-10-22)
**Where:** `src/controller.ts::decrypt` (the error of `SealClient.decrypt` is passed through); `src/aborts.ts`; the fix is `src/refusal.ts` and `SealController.explainRefusal`.

**Issue:** the abort map (S7, 0.0.22) was built on the assumption that the abort text might reach the caller; "not verified live" was recorded. The public
testnet committee answers a refused dry run with `NoAccessError` ("User does not have access to one or more of the requested keys") for every policy
abort (`E_WRONG_GATE`, `E_EXHAUSTED`, `E_GATE_PAUSED`, `E_TOO_EARLY`), and with `InvalidParameterError` ("PTB contains an invalid parameter, possibly a
newly created object that the FN has not yet seen") when the requester does not own an address-owned pass. Neither carries the abort, so `parseMoveAbort` finds
nothing in the error and `classifyPolicyAbort` returns `undefined`. Separately, one `SealController` (one `SealClient`) keeps the keys it fetched: a pause or an
exhausted pass reaches only controllers created afterwards (a revocation cannot recall a delivered key, which is also how Seal is meant to work).

**Impact:** a UI cannot say "this gate is paused" or "this pass is used up" from the decrypt error; it shows a generic refusal. Nothing is exposed: the refusal is correct.

**Remediation / evidence:** the same approve PTB simulated as the requester (`client.core.simulateTransaction`) aborts with the real code and `classifyPolicyAbort`
names it: observed 2026-10-22 for `E_WRONG_GATE` (2), `E_EXHAUSTED` (3), `E_GATE_PAUSED` (4), `E_ID_NOT_NAMESPACED` (1), `E_TOO_EARLY` (2) and, on a scratch package after
`migrate`, `config::E_WRONG_VERSION` (1). A non-owner makes the simulation itself throw ("Transaction was not signed by the correct sender: Object … is owned by account address …").
The README states this and `tests/integration/nft-gate.integration.test.ts` does it.

**Fix (0.0.23, commit 10b6bb0; OQ5 decided (b) on 2026-10-22):** `SealController.explainRefusal(type, params, id, { address })` builds the approve PTB through the provider (and holds it to `assertApproveOnly`), simulates it as `address` over the controller's client (`core.simulateTransaction`: read-only, no signing, no funds, one RPC, no SessionKey) and returns `{ kind: 'allowed' | 'refused' | 'unknown', reason?, module?, code?, message, advice?, cause?, raw? }`. `refused` carries the Move constant's name as `reason` (`E_GATE_PAUSED`, `E_EXHAUSTED`, `E_WRONG_GATE`, `E_TOO_EARLY`, `E_WRONG_VERSION`, …; `classifyPolicyAbort` with `[originalId, publishedAt]`, so another package's module of the same name is not named) and UI text in `message`; the non-owner case, where the node refuses to simulate at all, is `refused` with `reason: 'NOT_OWNER'`. `allowed` says the policy approves this address (the key servers were the problem). `unknown` is a network error (the error is `cause`), a failure that is not a Move abort, a provider that fails to build, or a result in a shape not read. It never throws on a refusal; only an unregistered policy type throws (as `decrypt`). `decrypt` does not call it (no extra RPC on every failure, its thrown types are unchanged); the README shows the use after a `NoAccessError` / `InvalidParameterError`. `explainApproveRefusal(client, tx, { sender, policyPackageIds })` is the same for a transaction built elsewhere. Pinned by `tests/refusal.test.ts` (61 tests: every row of `POLICY_ABORTS` structured and from the message alone, small code 1 told apart across the four modules, allowed, foreign package, unknown code, code outside the safe integer range, NOT_OWNER including on the `cause`, network and non-Error rejections, non-abort failures, nine malformed results, the controller method with build failures) and, live, by the maintainer-run test, which now asserts `explainRefusal` for the positive and each negative (E_WRONG_GATE, E_ID_NOT_NAMESPACED, E_EXHAUSTED, E_GATE_PAUSED, E_TOO_EARLY, NOT_OWNER): 8/8 against the testnet committee on 2026-10-22.

---

## Section A — Invariant verification matrix

| # | Invariant | Enforced / asserted at | Proven by | Status |
| --- | --- | --- | --- | --- |
| I1 | **Encryption binding:** encrypt to the original id; approve at the latest published-at | `controller.ts:139` (encrypt), `:181` (approve target) | "encrypt binds to the original id (not published-at)" and the decrypt-side "after a package upgrade" tests | HOLDS (encrypt pinned hermetically since 0.0.16 — F10) |
| I2 | **Ciphertext identity and package checked before key requests** (SEAL-M2) | `controller.ts:171-177` | identity / package / published-at-namespace tests | HOLDS |
| I3 | **Every provider verifies its identity layout** | required `verifyId`; `controller.ts:167` | provider and controller tests | HOLDS |
| I4 | **Approve PTB:** transaction-kind-only, only `seal_approve*` to the policy package, never signed | `assertApproveOnly`; `tx.build({ onlyTransactionKind: true })` | approve-only tests (foreign function, foreign package, empty) | HOLDS |
| I5 | **Identity layouts match the Move decoders bit-for-bit** | `bytes.ts`, providers | `conformance.test.ts` ↔ Move `conformance_*` (same literals, re-checked) | HOLDS |
| I6 | **Identity inputs are valid** (non-empty gate of the linked `access_gate`; soulbound unless allowed; u64 in range; not already unlocked) | `nft-gate.ts` `requireGateId`; `gate-check.ts` `assertLinkedGate` (`controller.ts:131-135`); `bytes.ts` `u64beBytes`; `timelock.ts` `buildId` | provider, controller and bytes tests named in F7, F8, F17 | HOLDS — the gate and soulbound checks run only when `accessGateOriginalId` is set (F24, ADJUDICATED) |
| I7 | **Threshold valid**; `checkShareConsistency` on; `verifyKeyServers` on for independent servers | constructor | threshold test | HOLDS — mixed-config caveat F13 |
| I8 | **SessionKey:** in memory; scoped to address and package; cleared on disconnect/switch; margin counted from key creation; one mint per address and package | `session()`, `mint()` (`controller.ts:205-236`), `clearSession()` | cache, clear and evict tests; the two F9 tests | HOLDS |
| I9 | **No key material or plaintext persisted or logged** | controller | review (DEM key discarded; no logging) | HOLDS (code-only) |
| I10 | **Deployment IDs only from the published records; unknown networks throw** | generator + `deployments.ts` (`Object.hasOwn`) | `check:deployments`; `deployments` tests incl. prototype keys | HOLDS (F12) |
| I11 | **Events decoded exactly; look-alikes rejected** | `parseSealedContentEvent` | sealed-content tests | HOLDS |
| I12 | **Discovery is display-only; callers can restrict it to trusted publishers** | `listSealedContent({ publishers })`, `gateOperators` (`operators.ts`) | publisher-filter tests in `sealed-content.test.ts`; `tests/operators.test.ts` pins `gateOperators` (F25) | HOLDS — the library default is unfiltered by design (F6); sealed-storage-ui lists operator-only |
| I13 | **Manifest validated before use** | `parseSealedManifest(raw, registry)` | manifest tests | HOLDS — hex `id`; with a registry, registered type and provider-narrowed `params` (F14) |
| I14 | **ABI coupling has a drift check** | `tests/abi-table.ts` + live drift test | offline completeness test; live drift (weekly `live.yml`) | HOLDS (F10, F18) |
| I15 | **Registry extensibility:** providers are peers; no controller change per policy | `PolicyRegistry`, `SealPolicyProvider` | registry tests | HOLDS (a replace must be explicit — F19) |

---

## Section B — Supply-chain, publish-authority & capability matrix

### B.1 Dependency & CVE risk

`npm audit --audit-level=high`: **0 vulnerabilities** (2026-10-09; also 0 at the first pass).

| Dependency | Pinned (installed) | Liveness dependency? | CVE / audit status | Notes |
| --- | --- | --- | --- | --- |
| `@mysten/seal` (peer) | `^1.4.18` (1.4.19) | encrypt and decrypt | clean | AES-256-GCM DEM default |
| `@mysten/sui` (peer) | `^2.33.2` (2.35.0) | PTB build, events | clean | workspace floor `^2.33.2` (the ADR-0001 text still names `^2.33.1`); one copy |
| `@meddleware/access-gate-client` | `^0.0.10` (0.0.10 working tree; 0.0.9 released) | gate suggestions, gate check, operator lookup; indexer reader | provenance attested | its reader findings are tracked in `access-gate-client-audit.md` (F15) |
| `@meddleware/sealed-storage-sui` (dev) | `0.0.7` exact | ID generation (build time) | provenance attested | source of every target |
| typescript / vitest / eslint (dev) | `~6.0.3` / `~5.0.2` / `^10.11.0` | build/test | clean | |
| Key-server committee | consumer config | decrypt — **fails closed** | n/a | B.SEAL-1 |
| Sui full node | consumer client | PTB object resolution; event reads — fails closed (throws) | n/a | |
| Read-indexer (optional) | consumer URL | discovery — first page falls back (also when the head page is stale: `polledAt` missing, null or older than 60 s, F26); cursor pages fail | n/a | display only |

**SEAL lens B.1 rows:**

| Item | Record |
| --- | --- |
| Key servers (per network) | consumer-configured. Defaults in sealed-storage-ui: testnet Mysten aggregator committee + 2 Mysten Open servers; mainnet Overclock, NodeInfra, H2O Nodes (Open) — fails closed |
| Aggregator | testnet `seal-aggregator-testnet.mystenlabs.com` (Mysten), keyless. No mainnet aggregator in the defaults (the README now agrees — F11) |
| Seal SDK | `^1.4.18` peer (installed 1.4.19); fits ADR-0001 (`@mysten/sui ^2.33.2` floor, satisfied by the dashboard pin) |

**Identity-layout coupling:**

| Layout | Client encoder | Move decoder | Shared vector |
| --- | --- | --- | --- |
| nft-gate `[32-byte gate id][16-byte nonce]` | `objectIdBytes` + `randomBytes(16)`; `verifyId` exactly 48 bytes | `nft_gate::assert_namespaced` (≥ 32) | `conformance-vectors.json` `nftGate` ↔ `conformance_gate_id_prefix_layout` |
| time-lock `[8-byte BE unlock_ms][8-byte nonce]` | `u64beBytes` (throws above 2⁶⁴ − 1 — F8) + `randomBytes(8)`; `verifyId` exactly 16 bytes | `timelock::seal_approve` (≥ 8) | `timelock` ↔ `conformance_unlock_ms_big_endian_matches_vector` |

**TS lens shared-dependency matrix row (this repo):**

| Package | dependency | devDependency | peer |
| --- | --- | --- | --- |
| `@mysten/sui` | — | `^2.33.2` | `^2.33.2` |
| `@mysten/seal` | — | `^1.4.18` | `^1.4.18` |
| `@meddleware/access-gate-client` | `^0.0.9` | — | — |
| `typescript` / `vitest` | — | `~6.0.3` / `~5.0.2` | — |

### B.2 Publish authority, capabilities & secret custody

| Authority / secret | Where | Custody | Gates | Rotation |
| --- | --- | --- | --- | --- |
| npm publish `@meddleware/sealed-storage-client` | `npm-publish.yml` (tag `v*`) | GitHub OIDC → npm trusted publisher; `--provenance` | releases | n/a |
| Key-server API keys | caller config (`apiKey`) | **public by design** in browsers (documented) | aggregator access | caller's; unused by Meddleware apps (ADR-0002) |
| Keys / capabilities | — | none held; signing is the caller's wallet | — | — |

#### CI & release integrity

| Item | Holds? | Evidence |
| --- | --- | --- |
| Actions pinned | Yes | SHA pins in both workflows |
| Least privilege | Yes | `contents: read`; `id-token: write` only on `publish-npm` |
| OIDC trusted publishing | Yes | SLSA v1 attestation for 0.0.19 (`npm view`, 2026-10-09) and 0.0.20 (2026-10-18) |
| Tag-gated, idempotent publish | Yes | `v*`; tag == version; registry probe |
| Verification parity | Yes | `npm-publish.yml` calls `node-ci.yml` as its `verify` job (audit, `check:deployments`, type-check, lint, test, build, package contents); no `--if-present` (F18) |
| Live suite | Yes | weekly `live.yml` (Mondays 05:47 UTC, read-only, no secrets; F10) |
| Container images / real funds / test-only modes | N/A | — |

### B.TS-1 Packaging

| Check | Holds? |
| --- | --- |
| `exports` | Yes — `.`, `./controller` (lets apps lazy-load `@mysten/seal`), `./deployments`; each has a `types` condition (F18) |
| `files` | Yes — `src`, `dist`, `CHANGELOG.md`, `SECURITY.md`; `npm pack --dry-run` = 31 files, no tests or scripts (F18) |
| `sideEffects: false` | Yes — no import-time effects (BCS struct and limits are `const`) |

### B.TS-2 Install-time code

None: no lifecycle scripts, no `allowScripts`, no `overrides`.

### B.TS-3 Supply-chain gates

`npm ci` everywhere; `npm audit --audit-level=high` in CI and publish; npm client pinned for publish; weekly grouped Dependabot updates (`.github/dependabot.yml`, since 2026-10-02).

### B.SC-1 ID-constant trace

| Location | Network | Value | Kind | Matches latest (evidence) |
| --- | --- | --- | --- | --- |
| `src/deployments.ts` (generated) | testnet | `0x0c8f7349…773d` / same / `0xee0403ba…7d1a` | original-id / published-at / PolicyConfig | Y — `check:deployments` vs `sealed-storage-sui@0.0.7` (`Published.toml` v1 = latest record; republished 2026-10-09, superseding `0x61c4aa…`, now immutable) |
| `tests/integration/abi-drift.integration.test.ts` | testnet | asserts published-at is the latest of `listPackageVersions(originalId)` | live | passed 2026-10-09 against the new package (`SEAL_TESTNET=1`, 3 files, 9 tests); weekly in `live.yml` (F10) |
| `src/providers/timelock.ts` | all | `0x6` | Clock | system object |
| Consumers (sealed-storage-ui) | testnet | `sealPoliciesDeployment(net)` | — | Y by construction |

### B.SC-2 Coupling table

| Move function (`seal_policies`) | Builder / provider | Test asserting target + arguments |
| --- | --- | --- |
| `nft_gate::seal_approve(vector<u8>, &PolicyConfig, &Gate, &AccessNFT)` | nft-gate `buildApprove` | `passes (id, PolicyConfig, gate, nft) in that order` |
| `nft_gate::seal_approve_soulbound(…, &SoulboundAccessNFT)` | nft-gate `buildApprove` (`soulbound: true`) | `selects the soulbound entry when requested` |
| `timelock::seal_approve(vector<u8>, &PolicyConfig, &Clock)` | time-lock `buildApprove` | `builds a timelock seal_approve move call over the Clock` (object order asserted) |
| `sealed_content::publish(&PolicyConfig, ID, String, String, String, &mut TxContext)` | `buildPublishSealedContentTx` / `…Transaction` | `PolicyConfig (version gate) is the first argument`; limits tests |

Signatures were cross-checked against `sealed-storage-sui/sources/*.move` at `0726070` (first pass) and re-checked at 2026-10-09 by the live ABI-drift test against the new package (`a03a532`, 0.0.7); they match.

### B.SC-3 Cross-implementation parity

| Behaviour | Client | Move | Shared vector / test |
| --- | --- | --- | --- |
| nft-gate prefix | `objectIdBytes` | `object::id_bytes` | yes (B.1) |
| time-lock encoding | `u64beBytes` | BE decode over 8 bytes | yes; the client now rejects values above u64 (F8) |
| `sealed_content` string limits | `SEALED_CONTENT_LIMITS` (UTF-8 bytes) | `MAX_*_BYTES` (`String.length()` bytes) | hand-mirrored tests on both sides |
| `SealedContentPublished` layout | BCS struct | Move struct | live decode test (weekly `live.yml`) |

### B.SEAL-1 Committee readiness (consumer configuration; owned by sealed-storage-ui and ADR-0002)

| Network | Servers (operators) | Mode | t | Change process | Existing ciphertexts |
| --- | --- | --- | --- | --- | --- |
| testnet | Mysten committee (aggregator) + Mysten Open ×2 | mixed | 2 | sealed-storage-ui env | bound to the servers in their header; move them with `describeCiphertext` + `sealedUnderServers` + re-seal (README) |
| mainnet | Overclock, NodeInfra, H2O Nodes (Open, keyless) | independent, Open mode 2-of-3 | 2 | sealed-storage-ui env + ADR-0002 | same |

The client validates `t ≤ total weight`. It does not require t ≥ 2, so a consumer can still choose t = 1;
the README no longer suggests it (F11), and MeddleWare's apps use t = 2 (ADR-0002).

### B.SEAL-2 Discovery registries

| Requirement | Holds? | Evidence |
| --- | --- | --- |
| Paginated with a cursor | Yes | `listSealedContent` cursors, source-bound |
| Filtered client-side | Yes | by gate, and by publisher through `publishers` / `gateOperators` (F6); the library default is unfiltered, sealed-storage-ui lists operator-only |
| Label size bounded | Yes | on-chain 256 bytes; mirrored in the builder |
| Rendered as untrusted data | consumer's (VUE lens, sealed-storage-ui) | — |

---

## Section C — Test-coverage & hermetic/live split

### C.1 Coverage grade — A- (182/182 hermetic tests, 13 files, 2026-10-22 (121 before `explainRefusal`, 109 on 2026-10-20, 103 on 2026-10-18); coverage % not re-measured, 2026-10-03 figures: 95.13% statements, 91.25% branches, 96.62% lines for the 77-test suite)

| Dimension | Assessment |
| --- | --- |
| Happy path | Encrypt (namespace binding, threshold, gate and soulbound checks), decrypt (mocked SDK), providers, builders, manifests, discovery (RPC and indexer), deployments, ciphertext description. |
| Error path | Identity, package and namespace mismatches; approve-only violations; threshold; manifests (hex id, registry, narrowed params); non-hex; layout lengths; plain-http indexer; look-alike events; empty, zero, non-gate and transferable-gate ids; u64 overflow and past unlock; prototype-key network; undecodable indexer rows; scan cap; registry replace. |
| Boundary | String limits (UTF-8); nonce widths; 2⁶⁴ − 1 accepted and 2⁶⁴ rejected; TTL margin with a slow signer; concurrent mints. |
| Security-relevant | Strong on pre-request checks and the encrypt binding; publisher filtering (literal addresses and `gateOperators`, F25). |

Coverage was not re-measured: the coverage plugin is not installed. The rows that were uncovered at the first pass
(`controller.ts` `encrypt`, the u64 branches in `bytes.ts`) now have the tests named in F8 and F10.

**Test layers:**

| Layer | Files | Gating variable | In CI? |
| --- | --- | --- | --- |
| Unit (offline) | 13 files, 182 tests | — | yes (`node-ci.yml`, and as the publish `verify` job) |
| Integration (live testnet: timelock round trip, ABI drift, sealed-content decode) | `tests/integration/*.integration.test.ts` (4 files, 17 tests; the 8 of `nft-gate.integration.test.ts` skip without `SEAL_LIVE_KEY_FILE`) | `SEAL_TESTNET=1` (+ optional `GRPC_TESTNET_URL`); the nft-gate file also a funded key | weekly (`live.yml`) for the 9 keyless tests; the nft-gate file is maintainer-run |

### C.2 Hermetic vs. live paths

| Path | Hermetic? | Deferred to | Tracking |
| --- | --- | --- | --- |
| Key-server committee behaviour, share consistency, full-node skew | no (live-only, per the SEAL lens) | integration suite (time-lock), weekly | F10 |
| nft-gate decrypt with a real pass (and negatives) | no | `tests/integration/nft-gate.integration.test.ts` — maintainer-run with a funded key (`SEAL_LIVE_KEY_FILE`), run on 2026-10-22 (with the `explainRefusal` assertions: 8/8); not in the weekly CI job (a funded key is not a CI secret) | F10, F27 |
| `encrypt` namespace binding | yes | `tests/controller.test.ts` | F10 |
| ABI of the published package | arity table | live drift, weekly | F10, F18 |
| `SealedContentPublished` layout vs chain | self-encoded | live decode, weekly | — |

---

## Section D — Deployment-readiness gates

### pre-localnet

- [x] identity vectors green on both sides; approve PTBs transaction-kind-only — F21
- [x] every provider verifies its identity layout client-side — F5
- [x] strict type-check, lint, unit tests green; `npm audit` 0 — 109/109, tsc, eslint, audit 0 (2026-10-18: 103/103; 2026-10-20: 109/109, `npm audit --audit-level=high` 0)
- [x] identity inputs validated (gate type, soulbound, u64 range, not already unlocked) — F7, F8, F17 (the gate
  and soulbound checks run when `accessGateOriginalId` is set: F24, ADJUDICATED)

### pre-testnet *(the package is in use on testnet)*

- [x] original-id (namespace) and published-at (approve target) recorded and used — F21; `encrypt` binding
  pinned by a hermetic test (F10)
- [x] threshold ≤ configured weight; SessionKey cleared on account switch and disconnect (sealed-storage-ui)
- [x] live decrypt round trip **with negatives** (wrong gate, exhausted/missing pass, too early,
  wrong namespace, paused gate) — F10: `tests/integration/nft-gate.integration.test.ts`, 8 tests, passed twice on 2026-10-22 against the public
  testnet committee (maintainer-run; repeat before each release of this package or of sealed-storage-sui). "Wrong namespace" is refused by the controller
  before any request and shown to abort in the dry run; a key server is not asked.
- [x] a client can tell a user why a decrypt was refused (paused, used up, wrong gate, too early, retired version, not the owner) — F27, 0.0.23:
  `SealController.explainRefusal`; unit-pinned for every abort of the table and asserted live (8/8, 2026-10-22)
- [x] live suite in CI on a schedule — weekly `live.yml` (F10, F18)
- [x] npm package with provenance; shared-dependency matrix aligned — 0.0.19 and 0.0.20, SLSA v1 attestations (0.0.20 released 2026-10-18, `dist.attestations` checked)

### pre-mainnet

- [ ] mainnet deployment recorded (sealed-storage-sui is unpublished on mainnet); unknown networks fail
  closed (F12, done) — mainnet-blocked: mainnet publication (`OPERATOR_TASKS.md` "Mainnet release custody")
- [ ] mainnet key servers chosen and verified; `verifyKeyServers` on; t decided — decided (decision):
  Overclock, NodeInfra and H2O Open mode 2-of-3 in sealed-storage-ui, README follows ADR-0002 (F11), `verifyKeyServers`
  is on for that configuration (F13). Not ticked: mainnet-blocked, the operator terms are a maintainer item
  (`OPERATOR_TASKS.md` "Mainnet Seal key servers").
- [ ] policy-package UpgradeCap custody executed (sealed-storage-sui OQ3) — disclosed in `SECURITY.md`; the
  new UpgradeCap is with the deploy key; multisig transfer and burn are the pre-mainnet process
  (`OPERATOR_TASKS.md` "Mainnet release custody")
- [x] a stale indexer head page falls back to the full node (sui-indexer F19, the discovery half) — F26, 0.0.21 (needs access-gate-client `^0.0.10`)
- [x] discovery can be authenticated by publisher — F6 (`publishers`, `gateOperators`; sealed-storage-ui is operator-only)
- [x] SessionKey margin and persistence reviewed — F9 (memory-only; margin from key creation)
- [ ] external review — maintainer item

---

## Cross-project themes

- **Supply chain & release integrity:** peer SDKs (one copy); lockfile; SHA-pinned actions; OIDC
  provenance; IDs generated from a provenance-attested, exactly pinned Move package and drift-checked
  in CI.
- **Wire-format coupling & conformance vectors:** identity layouts are shared with the Move decoders
  through vectors asserted in both repos. Approve and publish argument orders are asserted here and
  arity-checked live. Event layout is checked live (weekly).
- **On-chain-truth boundary:** access is decided only by the policies the key servers evaluate. This
  package never decides access. Its inputs could make content unreachable (F7) or open (F8, F17); those
  inputs are now refused. Its discovery output is untrusted by default and can be filtered by publisher (F6).
- **Deployment readiness:** Section D.
- **Chain-access layering & on-chain ID/ABI coupling (ADR-0001):**
  - this is the domain client for `seal_policies`; sealed-storage-ui delegates to it and holds no ID literals;
  - it reads `access_gate` only through access-gate-client;
  - call targets use published-at, and types, events and the namespace use original-id, both
    recorded;
  - the `access_gate` id used for suggestions and the encrypt-time gate check is caller-supplied, not
    derived from the one `seal_policies` links (F7); a wrong id fails closed.
- **Pre-v0.2 policy:** F7, F8, F9, F12, F14 and F16 changed exported types without shims (breaking changes
  in 0.0.16–0.0.18, patch-only bumps until go-live; sealed-storage-ui bumped in step, consuming `^0.0.19`; `^0.0.20` since the 2026-10-18 release).
- **Shared with sibling audits:**
  - access-gate-client F5 / F7 / F8 ↔ F12 / F15;
  - sealed-storage-sui F4 / OQ4 ↔ F6;
  - sealed-storage-sui F16 / OQ9 ↔ F17;
  - sealed-storage-sui F27 / OQ11 ↔ F16.

---

## Normative requirements (MUST / MUST NOT)

1. MUST encrypt to the original-id namespace and target the latest published-at — holds (I1). The
   encrypt side MUST be covered by a test — holds since 0.0.16 (F10).
2. MUST verify the ciphertext identity and package before requesting keys — holds (I2).
3. MUST build approve PTBs transaction-kind-only with only same-package `seal_approve*` calls, and
   never sign them — holds (I4).
4. MUST NOT produce an identity that is wrapped, empty-namespaced or bound to a gate the policy
   package cannot accept, nor to a gate whose passes can be transferred (unless `allowTransferableGates`) —
   holds (F7, F8, F17); the gate checks need `accessGateOriginalId` to be configured (F24).
5. MUST keep the SessionKey cache margin relative to key creation — holds (F9).
6. MUST let consumers restrict discovered content to trusted publishers, and MUST state that Seal does
   not authenticate content — holds (F6: `publishers`, `gateOperators`, `SECURITY.md` invariant 4); the
   library default is unfiltered by design, and `gateOperators` is pinned by `tests/operators.test.ts` (F25).
7. MUST throw for any network without its own recorded deployment — holds (F12, `Object.hasOwn`).
8. MUST document only key-server configurations consistent with ADR-0002 — holds (F11).

**SEAL lens baseline:**

| ID | Holds? | Evidence |
| --- | --- | --- |
| SEAL-M1 | yes (encrypt pinned hermetically) | I1, F10 |
| SEAL-M2 | yes | I2 |
| SEAL-M3 | yes | I4 |
| SEAL-M4 | t ≤ servers yes; ≥ 2 independent operators is the consumer's (sealed-storage-ui yes, mainnet 2-of-3 Open mode; README follows ADR-0002 — F11); `verifyKeyServers` off in mixed configs, visible through `verifiesKeyServers` (F13) | B.SEAL-1 |
| SEAL-M5 | yes: bounded, scoped, cleared, never exported; margin counted from key creation | F9 |
| SEAL-M6 | yes (`SECURITY.md` "Identities and labels are public") | — |
| SEAL-M7 | yes: non-revocability and membership stated in `SECURITY.md`; a past unlock time is refused unless `allowPast` (F8); transferable gates refused (F17) | — |
| SEAL-M8 | yes (`SECURITY.md` "The policy package can change") | — |

**SUI_CLIENT lens baseline:**

| ID | Holds? | Evidence |
| --- | --- | --- |
| SC-M1 | yes | B.SC-1 |
| SC-M2 | yes (events at the exact type; gate type checked at encrypt when configured — F7, F24) | F23 |
| SC-M3 | N/A (no execution) | — |
| SC-M4 | yes: addresses normalised; `unlockMs` is `number \| bigint` with u64 bounds | F8 |
| SC-M5 | yes: IDs keyed by network; prototype keys refused | F12 |
| SC-M6 / SC-M7 / SC-M9 | N/A | — |
| SC-M8 | yes | I4 |
| SC-M10 | yes | — |

**TS lens baseline:**

| ID | Holds? | Evidence |
| --- | --- | --- |
| TS-M1 | yes (`strict`, `noUncheckedIndexedAccess`; casts at the registry and indexer are typed downstream) | — |
| TS-M2 | yes: manifests, ids and u64 validated; undecodable rows skipped and counted | F7, F8, F14, F15 |
| TS-M3 | yes: `unlockMs` accepts `bigint`; u64 bounded | F8 |
| TS-M4 | yes | — |
| TS-M5 | indexer via the shared reader; gRPC timeouts are the caller's | F15 |
| TS-M6 | yes (errors include ids and hex, never keys or signatures) | — |
| TS-M7 | yes | B.TS-1/2 |
| TS-M8 | yes | B.TS-3 |

## Implementation suggestions (SHOULD / MAY)

Status at 2026-10-09 in brackets.

- **S1** SHOULD expose `gateOperators()` and a publisher-filtered listing as the default discovery
  path (F6). [Done: both exist; the default for UIs is sealed-storage-ui's operator-only listing, the library
  default stays unfiltered.]
- **S2** SHOULD add an `encrypt` pre-flight per provider (`validateEncryptParams(client, params)`)
  covering F7 and F8, so the registry stays the only extension seam. [Not adopted: the id and u64 checks
  live in the providers' `buildId`, and the chain read in `gate-check.ts`, called from the controller (F7,
  F8, F24).]
- **S3** SHOULD record `namespace` (original-id) in new manifests (F16). [Dropped: legacy namespaces are
  unsupported by decision.]
- **S4** MAY coalesce concurrent SessionKey mints and expose `hasSession(address)` for UIs (F9). [Coalescing
  done; `hasSession` not added.]
- **S5** SHOULD add the live nft-gate negatives to the integration suite and schedule it (F10). [Scheduled:
  done. The nft-gate negatives: done 2026-10-22 as a maintainer-run test; not scheduled in CI because it needs a funded key.]
- **S6** MAY warn at construction when `threshold === 1` or when `verifyKeyServers` is disabled by a
  mixed configuration (F11, F13). [Not added; `verifiesKeyServers` exposes the setting.]

- **S7** SHOULD map the `seal_policies` abort codes by `(module, code)` so a client can tell a paused gate from a missing pass
  and a retired package version from a bad identity (sealed-storage-sui dev-guide rule 5, OQ5). [Done in 0.0.22, commit 10b6bb0:
  `src/aborts.ts` (`POLICY_ABORTS`, `describePolicyAbort`, `parseMoveAbort`, `classifyPolicyAbort`), `nft_gate` 4 `E_GATE_PAUSED` and `config` 1
  `E_WRONG_VERSION` plus the other codes of the four modules; `tests/aborts.test.ts` (8 tests, and 4 that compare the table with the Move
  constants when sealed-storage-sui is next to this repo). Verified live 2026-10-22 (F27): a key server's refusal carries no abort text (`NoAccessError` / `InvalidParameterError`), so the map applies to the approve PTB simulated by the client, not to the error of `decrypt`; OQ5.]

- **S8** MAY let a client ask why a decrypt was refused (F27, OQ5). [Done in 0.0.23, commit 10b6bb0: `SealController.explainRefusal`
  and `explainApproveRefusal` (`src/refusal.ts`); opt-in, one read-only simulation, `decrypt` unchanged.]

## Open questions

OQ1–OQ5 are answered (decisions, not open items).

- **OQ1** Discovery authenticity (F6): (a) client-side publisher filtering, (b) the curated on-chain
  `publish_curated` from `sealed-storage-sui` OQ4, (c) content signing in the manifest. **Answered: (a).**
  `publishers` and `gateOperators` shipped in 0.0.16 and sealed-storage-ui lists operator-only pointers; (b) and (c) are
  not planned.
- **OQ2** Should `encrypt` read chain state (F7: gate type; F17: soulbound) and refuse? **Answered: yes, as an
  opt-in.** With `accessGateOriginalId` set it reads the gate and refuses; without it, encryption needs only
  the key servers' public keys (F24, ADJUDICATED).
- **OQ3** Support legacy `seal_policies` namespaces (F16)? **Answered: no**; superseded packages are
  republished, not migrated.
- **OQ4** Ship `.d.ts` declarations like the sibling SDKs? **Answered: yes**, since 0.0.16 (F18).
- **OQ5** (F27) Should the library explain a refusal itself? A key server's answer carries no abort, but the approve PTB simulated as the requester does. Options:
  (a) leave it to the caller; (b) `SealController.explainRefusal(type, params, id, { address })` that builds the same approve PTB, simulates it and returns the
  classified abort or the ownership error, for the caller to run after a `NoAccessError`; (c) do it inside `decrypt` and wrap the error. **Decided 2026-10-22
  (the maintainer's delegate, single best-practice answer): (b).** It is opt-in (one extra read-only RPC only when the caller asks), keeps `decrypt`'s errors
  unchanged and uses only public APIs; (c) adds an RPC to every failure and changes thrown types. Implemented in 0.0.23 (F27, S8).

## Risks

- **Committee trust:** ≥ t colluding key servers decrypt everything. Fewer than t online means no one
  can decrypt. Consumer configuration decides both.
- **Upgrade authority:** until the `seal_policies` UpgradeCap is burned, access to existing content can
  change. Disclosed in `SECURITY.md`; the live UpgradeCap is with the deploy key until the pre-mainnet custody
  process (`OPERATOR_TASKS.md` "Mainnet release custody").
- **Authenticity:** decrypted content is authenticated only by the namespace, not the author (F6). The
  publisher filter is the caller's choice, and `gateOperators` is pinned by `tests/operators.test.ts` (F25).
- **Irrecoverable or open sealing:** content bound to a wrong gate, or sealed to a transferable-pass gate,
  cannot be repaired after storage. The inputs are refused only when `accessGateOriginalId` is configured
  (F7, F17, F24); a wrapped unlock time is always refused (F8).
- **Stale discovery:** a stuck indexer is detected from `polledAt` (60 s) and the full node answers (F26). A client clock
  more than 60 s ahead makes every head page look stale, which disables the indexer for that client only.
- **Live nft-gate coverage:** the decrypt negatives against a real pass ran live on 2026-10-22 (F10) and are maintainer-run; a key-server or policy change is caught only when someone runs them (README, `OPERATOR_TASKS.md`).
- **Shared-SDK fragility:** a single `@mysten/seal` / `@mysten/sui` copy in hosts, held by peer
  dependencies and the dashboard pin.

---

## Re-verification log

- 2026-10-03 — first in-repo pass at `bdd72c0` (tag `v0.0.15`, npm 0.0.15 with provenance).
  - **Lenses:** AUDIT_TEMPLATE.md (2026-10-02) + SEAL (2026-09-30) + SUI_CLIENT (2026-09-30) +
    TS (2026-10-03).
  - **Measured:** vitest 77/77; coverage 95.13 / 91.25 / 96.62; tsc, eslint, audit (0) and
    `check:deployments` clean; pack 15 files.
  - **Probes:** a scratch probe confirmed F7, F8, F12 and F14.
  - **Not runnable here:** live integration and direct Seal-docs fetch (egress blocked).
  - **Corpus IDs:** F2, F4 and F5 preserved from code citations. New findings F6–F23; OQ1–OQ4.
  - **No findings resolved:** by maintainer instruction this pass only records findings.
    Remediation, including single-solution fixes under the resolve-inline rule, is to be applied
    separately, with each disposition moved to RESOLVED and the diff cited.

- 2026-10-09 — re-verification against `v0.0.19` (`3527c58`; `main` HEAD `b4a42ea`, one Dependabot bump).
  - **Lenses:** AUDIT_TEMPLATE.md (2026-10-08) + SEAL (2026-09-30) + SUI_CLIENT (2026-10-08) + TS (2026-10-08).
    VUE, WALRUS, AUTH, OPS and IMG stay untriggered (front matter).
  - **Measured:** vitest 97/97 (10 files); tsc, eslint, `npm audit --audit-level=high` (0) and
    `check:deployments` (`sealed-storage-sui@0.0.7`) clean; `SEAL_TESTNET=1 npm run test:integration`
    3 files, 9 tests passed against the new package; `npm view` shows 0.0.19 as `latest` with provenance.
  - **Dispositions (23 entries):** RESOLVED 14 (F2, F4, F5, F6, F7, F8, F9, F11, F12, F14, F15, F17, F18, F19);
    MITIGATED 3 (F10, F13, F20); ADJUDICATED 2 (F16, F24); ACCEPTED-RISK 1 (F25); Positive 3 (F21–F23). None
    OPEN. The fixes shipped in 0.0.16 (`affd00b`), 0.0.17 (`cfd4a5e`), 0.0.18 (`f8d6a13`) and 0.0.19 (`3527c58`).
  - **Changed in this pass:** stale line references corrected (controller lines moved); versions, package ids
    and the `seal_policies` republication (`0x0c8f7349…`, superseding the now-immutable `0x61c4aa…`) updated
    throughout Sections A to D; Section A GAP rows I6 and I12 now HOLD; Section C counts and layers (97
    tests, weekly live run); Section D gates ticked with evidence; the normative lists, SEAL, SUI_CLIENT and
    TS baselines, suggestions S1–S6, OQ1–OQ4 (answered as decisions) and Risks brought in line.
  - **F25 (unchanged):** `gateOperators` is still not referenced by any test (`grep` over `tests/`).
  - **Residuals found:** `CLAUDE.md` still names access-gate-client `^0.0.7` while `package.json` has
    `^0.0.8`, and `SECURITY.md` still numbers its invariants 1–4, 6, 7 (F20); both are cosmetic and ship
    with the next patch.
  - **Still not done (maintainer or mainnet):** live nft-gate decrypt negatives (F10, needs a funded test
    wallet); mainnet publication, Seal mainnet key-server terms and UpgradeCap custody (`OPERATOR_TASKS.md`
    "Mainnet release custody", "Mainnet Seal key servers"); external review.
  - **No new findings.** The Seal documentation basis was not re-fetched.

- 2026-10-18 — fix wave on the working tree after `v0.0.19` (`ac56f2b`); release 0.0.20, commit `48fd9d6`.
  - **Changed:** `@meddleware/access-gate-client` bumped to `^0.0.9` (abort codes 15/16, `validateGatePolicy`;
    no source change needed); `engines.node` `>=24` (fleet decision D41; F18 `engines` item now done);
    `gateOperators` tests added (F25 RESOLVED); `CLAUDE.md` and `SECURITY.md` residuals fixed (F20 RESOLVED).
  - **Measured:** vitest 103/103 (11 files); tsc, eslint, `npm audit --audit-level=high` (0),
    `check:deployments`, `npm run build` and the pack contents are clean. The live suite was not run.
  - **Dispositions (23 entries):** RESOLVED 16 (adds F20, F25); MITIGATED 2 (F10, F13); ADJUDICATED 2
    (F16, F24); Positive 3. F13 stays MITIGATED: the construction-time warning (S6) is a product choice with
    no single best practice, and the SDK switch is upstream.
  - **Still not done (maintainer or mainnet):** unchanged from 2026-10-09 (live nft-gate negatives, mainnet
    publication, key-server terms, UpgradeCap custody, external review).
  - **No new findings.**
- 2026-10-18 (later) — released (0.0.20), consumers bumped (sealed-storage-ui, docs, dev and sui-indexer: `^0.0.20`). `npm view` shows
  `@meddleware/sealed-storage-client` 0.0.20 as `latest`, published 2026-10-18T09:06Z, with SLSA v1 provenance
  (`dist.attestations`); tag `v0.0.20` = `9ef93f9` (code `48fd9d6`). The Section D provenance box
  ("0.0.20 pending release") is updated with that evidence; the unticked boxes are unchanged (live nft-gate negatives,
  mainnet items, external review).
- 2026-10-19 — dependency-bot status checked (read-only): `.github/dependabot.yml` carries the `ignore` rules and the repository has no open Dependabot pull requests (`gh pr list`, 2026-10-19). Versions, findings and gates were not re-examined in this pass.
  - Dependabot policy encoded in .github/dependabot.yml (majors declined); open PRs merged 2026-10-19
- 2026-10-20 — sui-indexer F19 closed on the discovery side: version 0.0.21 (local commit, commit 8d3f8e6; not tagged or
  published), `@meddleware/access-gate-client` `^0.0.10`.
  - **F26 RESOLVED:** `listSealedContent` falls back to the full node when the indexer's head page is stale (inherited from
    the shared reader, access-gate-client F25); six hermetic tests added; the indexer fixtures carry `polledAt`.
  - **Measured:** vitest 109/109 (11 files) against a local link of the access-gate-client 0.0.10 working tree; tsc,
    eslint, build and `check:deployments` clean; `npm audit --audit-level=high` 0. The lockfile resolution of `^0.0.10` is for the
    release (access-gate-client 0.0.10 must be published first, then `npm install` here).
  - **Dispositions (24 entries):** RESOLVED 17 (adds F26); MITIGATED 2 (F10, F13); ADJUDICATED 2 (F16, F24);
    Positive 3.

- 2026-10-22 (fix wave, 0.0.22, local commit, not released) — the abort map (S7).
  - **Done:** `src/aborts.ts` exports `POLICY_ABORTS` (every code of `config`, `nft_gate`, `timelock`, `sealed_content`), `describePolicyAbort(module, code)`, `parseMoveAbort` (the Sui clients' abort message, the older debug form, a structured status, an `Error` and its `cause` chain) and `classifyPolicyAbort(input, { policyPackageIds })`, which refuses an abort from a package that is not the policy package. `nft_gate` 4 is `E_GATE_PAUSED` and `config` 1 is `E_WRONG_VERSION`. README section "Telling aborts apart", CLAUDE.md key-files row, CHANGELOG.
  - **Measured:** vitest 121/121 (12 files; 109 before), `tsc --noEmit` and eslint clean. The table is compared with the Move constants of the sibling checkout (sealed-storage-sui `sources/*.move`) in four tests.
  - **Not verified:** what a key server's refusal looks like to the client (the abort text may not reach the caller; the parser then returns undefined and the caller shows a generic refusal). No disposition changes; no finding was opened or closed by this item.
- 2026-10-22 (live nft-gate round trip with negatives; test and docs only, no `src` change) — Section D live gate run.
  - **Added:** `tests/integration/nft-gate.integration.test.ts` (8 tests; skips unless `SEAL_TESTNET=1` and `SEAL_LIVE_KEY_FILE` are set), README section "Live nft-gate round trip with negatives", a comment in `live.yml`. It does not run in CI.
  - **Run:** the maintenance runner `0xbf4bd853…424f` (testnet), twice, 8/8 each (about 55 s, about 0.05 SUI per run). Exploration before it, with digests: gates G1 `DyXgvm3kXkXz6uNMkaEJEKVJv78d6DuCTm71wJEoYH4D` (soulbound, 1 use, pause blocks decryption and access), G2 `Di4fqzfL37QjpV6S7KDJczQZpckn5MEWSbUFms7kHJtK` (transferable), G3 `7hVyPZswbwRTCK8zoXJgPrce74TScCcP2fnnMhKY8HPS`; passes `6rx8Md4qeXQao6E2LvXJgvTSqSUiqCaGvM3Sn2cet7wn`, `7UtMTZE5XXzm3tmBCJSTA8mnX3h5fg1qBgahDagLF6yL`; exhausted by `EgZB68w8y5j4QbwW2GsWnetui9uK4UNYictTezBcTf2D`; paused `61CYonoPifx9t9Du4vQW9mtFk6mhJKP4tysZeBBriYKi` / unpaused `63npSZscbEX53uee6NjyEZAM5TJUnFwTWD6fw7FU2ssk`; frozen transferable pass `HctRUdKKsuvaUggHQirzjbHh5g1vhjorrnef1A5dkJL4`. Committee: the three servers of `timelock.integration.test.ts` (aggregator `seal-aggregator-testnet.mystenlabs.com` and two independent), threshold 2.
  - **Observed key-server text (answers the 0.0.22 "not verified" note):** a refusal is `NoAccessError: User does not have access to one or more of the requested keys`; a non-owner is `InvalidParameterError: PTB contains an invalid parameter, possibly a newly created object that the FN has not yet seen`. Neither carries the abort. The abort map classified the simulated approve PTB correctly in every case (F27). A first attempt with one controller allowed every later request: the `SealClient` caches fetched keys, so each refusal needs a new controller (documented in the test header and README).
  - **Dispositions (25 entries):** RESOLVED 18 (adds F10), MITIGATED 2 (F13, F27), ADJUDICATED 2 (F16, F24), Positive 3. New: F27 and OQ5 (recommendation (b), waits for the maintainer). Section D: the live round-trip box is ticked.
  - **Measured:** `tsc --noEmit`, eslint, vitest 121/121 (unit), integration config 9 passed / 8 skipped without a key. Release: none needed for the test and README (no `src` change); a helper for OQ5 would be 0.0.23.

- 2026-10-22 (0.0.23, local commit, not released) — OQ5 decided (b); `explainRefusal` (F27).
  - **Decided:** OQ5 option (b), recorded as decided 2026-10-22 by the maintainer's delegate: opt-in helper, `decrypt` unchanged.
  - **Done:** `src/refusal.ts` (`explainApproveRefusal`, `refusalMessage`, `REASON_NOT_OWNER`, types `RefusalExplanation`, `RefusalClient`) and `SealController.explainRefusal`; read-only `simulateTransaction` as the requester, `classifyPolicyAbort` with `[originalId, publishedAt]`, the non-owner simulation error as `NOT_OWNER`, never throws on a refusal (network errors and unreadable results are `unknown` with the `cause`/`raw`). README section "Why was this decrypt refused?", CLAUDE.md key-files row, CHANGELOG, version 0.0.23.
  - **Measured:** `tsc --noEmit`, eslint, vitest 182/182 (13 files; 61 new in `tests/refusal.test.ts`), build, pack and `check:deployments` clean. Live: `tests/integration/nft-gate.integration.test.ts` (extended to assert `explainRefusal` for the positive and every negative) passed 8/8 on 2026-10-22 against the testnet committee with the maintenance runner key (balance 0.376 SUI before the run); `NOT_OWNER` observed for the non-owner, `E_WRONG_GATE`, `E_ID_NOT_NAMESPACED`, `E_EXHAUSTED`, `E_GATE_PAUSED` and `E_TOO_EARLY` named, the owner `allowed`.
  - **Dispositions (25 entries):** RESOLVED 19 (adds F27), MITIGATED 1 (F13), ADJUDICATED 2 (F16, F24), Positive 3. S8 added; Section D box added; OQ5 answered.

## Pre-save consistency checklist (this pass)

- [x] Section A ↔ findings — no GAP rows remain; rows cite F6, F7, F8, F9, F10, F12, F13, F14, F19, F24, F25.
- [x] Finding header ↔ body — consistent; every disposition carries evidence or a named gate.
- [x] Template line — base + SEAL + SUI_CLIENT + TS with registry dates; untriggered lenses named.
- [x] Closing four-part structure — present (normative, suggestions, open questions, risks).
- [x] Section D ↔ dispositions — unticked items are mainnet-blocked or maintainer-only, and say which.
- [x] Executive summary ↔ dispositions and ceiling (no finding open above Low).
- [x] C.1 counts — tests measured 2026-10-22 (182/182); coverage percentages are the 2026-10-03 figures.
- [x] Re-verification log entry added (2026-10-03 and 2026-10-09).
- [x] 2026-10-22 (0.0.23): F27 RESOLVED (`explainRefusal`), OQ5 answered, S8 and a Section D box added; counts 25 entries (RESOLVED 19, MITIGATED 1); C.1 182/182; log entry added.
- [x] 2026-10-22 (live run): F10 RESOLVED, F27 and OQ5 added; the Section D live box ticked; C.2, S5, S7 and Risks lines updated; counts 25 entries (RESOLVED 18); log entry added.
- 2026-10-24 — repository renamed from `seal-client` to `sealed-storage-client` (workspace naming convention, `docs/architecture/ADR-0003-naming.md`): package, image, host and path names updated throughout. No finding, disposition or evidence changed.
- 2026-10-24 — identifier alignment (`docs/architecture/ADR-0004-identifier-alignment.md`): docs and errors name `sealed_storage`; no behaviour change.
