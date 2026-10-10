# Security Audit — `seal-client`

**Classification:** Internal security review (initial audit, re-verified 2026-10-09 — awaiting external review)
**Project:** seal-client (`@meddleware/seal-client`). The client half of Sealed Storage:
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

- npm `@meddleware/seal-client` **0.0.19**, published from tag `v0.0.19` = `3527c58` (2026-10-09). It
  carries an SLSA v1 provenance attestation (re-checked with `npm view` 2026-10-09). `main` HEAD is
  `b4a42ea`, one Dependabot group bump after the tag (unreleased).
- It is consumed at `^0.0.19` by seal-ui and the docs site.
- It targets `seal_policies` on testnet only (no mainnet publication exists): `0x0c8f7349…` (republished
  2026-10-09, links `access_gate` `0xd7ddaa94…`). Mainnet publication and the Seal mainnet key-server
  terms are maintainer items (`OPERATOR_TASKS.md` "Mainnet release custody", "Mainnet Seal key servers").

**Review date:** 2026-10-03; re-verified 2026-10-09
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
finding was fixed in 0.0.16–0.0.19 except the live nft-gate negatives (F10, maintainer-only).

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
**Runtime targets:** browsers (via Vite in seal-ui and the dashboard) and Node (integration tests).
There is no `engines` field, like the sibling libraries (F18).
**Peer dependencies:** `@mysten/seal` `^1.4.18` and `@mysten/sui` `^2.33.2` (both also
devDependencies). The runtime dependency is `@meddleware/access-gate-client` `^0.0.8`.

**Sui SDK:** `@mysten/sui` `^2.33.2` (installed 2.35.0, deduped). **Transport:** gRPC core API
through structural client types, plus an optional HTTPS read-indexer (display only). No JSON-RPC.
**Networks:** testnet (the only recorded deployment); an unknown network throws (F12).
**Seal SDK:** `@mysten/seal` `^1.4.18` (installed 1.4.19).

**Key-server mode / servers / threshold.** These are chosen by the consumer and validated here.
Current consumer defaults (`seal-ui/src/config.ts`):

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
`@meddleware/seal-policies-sui@0.0.7`):

- original-id = published-at = `0x0c8f73490b14836e6a7a724fb46b242cb061d04a5f193fd637159997f8a1773d`
  (v1; links `access_gate` `0xd7ddaa94b74330979b2b618fc81206d160a264f1c9ca148a77fa2144301388c9`);
- `PolicyConfig` = `0xee0403ba15c250223527150d147f29bedfb1ec46bb2282c341be462ff0ad7d1a`;
- UpgradeCap **live** with the deploy key until the pre-mainnet custody process (see
  `seal-policies-sui-audit.md` B.3; `OPERATOR_TASKS.md` "Mainnet release custody");
- the superseded `0x61c4aa…` package is immutable (UpgradeCap burned 2026-10-09).

**On-chain packages consumed:**

| Network | Package | original-id | published-at | Shared object | Source |
| --- | --- | --- | --- | --- | --- |
| testnet | `seal_policies` | `0x0c8f7349…773d` | same | `PolicyConfig` `0xee0403ba…7d1a` | `src/deployments.ts`, generated by `scripts/gen-deployments.mjs` and checked in CI |
| testnet | `access_gate` (suggestions, gate check, operator lookup; via access-gate-client) | caller-supplied (`accessGateDeployment(net).originalId` = `0xd7ddaa94…88c9`) | — | — | `@meddleware/access-gate-client/deployments` |

**Location:** `seal-client/docs/audit/seal-client-audit.md`. This is a new directory; see the
finding-IDs note above for the corpus file.

---

## Executive summary

`@meddleware/seal-client` is 1,320 lines in 13 modules (0.0.19; it was 1,082 lines in 11 modules at the first pass).

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
    disconnect or account switch (seal-ui `seal.ts:95-104`).
  - The DEM key `@mysten/seal` returns from `encrypt` is discarded.
- **Discovery.** Events decode from BCS at the exact event type. Look-alike packages are rejected.
  Indexer reads use access-gate-client's shared reader.
- **Deployment IDs.** They are generated from the published Move records and drift-checked in CI.
  Identity layouts match the Move decoders through a shared vector.

**Measured (2026-10-09, 0.0.19):**

- **Hermetic checks:** **97/97** unit tests in 10 files (77 at the first pass). tsc, eslint,
  `npm audit --audit-level=high` (0) and `check:deployments` (matches `seal-policies-sui@0.0.7`) are
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
  and are maintainer-only), F13 (`verifiesKeyServers`; the SDK switch itself is unchanged), F20 (two
  cosmetic doc residuals).
- **Adjudicated:** F16 (legacy namespaces unsupported), F24 (the gate and soulbound checks are opt-in).
- **Accepted risk:** F25 (`gateOperators` has no hermetic test).

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
   - seal-ui lists pointers unfiltered today.
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
     key) that contradicts ADR-0002, this package's own CLAUDE.md, and seal-ui.
   - **F12:** `sealPoliciesDeployment('constructor')` returns a prototype member.
3. **Info (F13–F20):**
   - `verifyKeyServers` is all-or-nothing;
   - manifest `id` and `params` are only shape-checked;
   - indexer and event robustness is inherited from access-gate-client;
   - content under superseded namespaces cannot be decrypted;
   - client-side options for the frozen-pass issue (seal-policies-sui F16);
   - packaging and CI details;
   - the registry replaces providers silently;
   - documentation drift.

**Posture:** the cryptographic orchestration is careful and defence-in-depth checks are in place. The
edge work the first pass listed is done:

- discovery can be authenticated by publisher (F6), and seal-ui uses operator-only listing by default;
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
package (`seal-policies-sui-audit.md`). This package's job is to bind data to the right namespace and
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
| **Publishers of discovery pointers** | label, blob id, seal id under any gate | spoofed pointers to attacker-encrypted content that decrypts successfully | gate-id filter plus the `publishers` filter and `gateOperators` (F6); the library default is unfiltered, seal-ui lists the operator's pointers only |
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
| `@meddleware/seal-policies-sui` npm package | `Published.toml` / `deployments.json` → every ID | exact devDependency pin `0.0.7` (with provenance); HEX_ID validation; `check:deployments` in CI |
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

- `seal-policies-sui` at `a03a532` (0.0.7; first pass: `0726070`): Move signatures, identity decoders,
  conformance literals, `Published.toml` / `deployments.json`.
- `seal-ui` (`src/config.ts` committee defaults; `src/seal.ts` `clearSession` wiring;
  `src/sealed-content.ts` operator-filtered discovery, `src/manifest-guard.ts`).
- `access-gate-client` 0.0.8 (`fetchOwnedGates`, `fetchGate`, `readIndexerEvents`).

**Out of scope:** Seal and `@mysten/seal` internals; the key servers; the Move package (own audit);
seal-ui (own audit; consumer facts cited); the read-indexer service.

**Environment / commands (2026-10-09, Node 24.13.0, existing `node_modules`; the first pass was
2026-10-03 on Node 22.22.2):**

| Command | Result |
| --- | --- |
| `npx vitest run` | **97 passed** (10 files) |
| `npx vitest run --coverage` | not re-run: the coverage plugin is not installed. First-pass figures (77 tests): 95.13% statements, 91.25% branches, 95.23% functions, 96.62% lines; `controller.ts:101-109` (`encrypt`) was uncovered then and is covered now (F10) |
| `npx tsc --noEmit` / `npx eslint .` | clean / clean |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `npm run check:deployments` | `src/deployments.ts matches @meddleware/seal-policies-sui@0.0.7` |
| `SEAL_TESTNET=1 npm run test:integration` | **3 files, 9 tests passed** (ABI drift against the new package, `SealedContentPublished` decode, time-lock round trip over the independent servers) |
| `npm pack --dry-run` | 31 files, 29.9 kB: `src/**` (13), `dist/**` declarations (13), `CHANGELOG.md`, `README.md`, `SECURITY.md`, `LICENSE`, `package.json`. No tests or scripts. |
| `npm ls @mysten/sui @mysten/seal @mysten/bcs @meddleware/access-gate-client` | one copy each (2.35.0 / 1.4.19 / 2.1.2 / 0.0.8), deduped through access-gate-client |
| `npm view @meddleware/seal-client@0.0.19` | SLSA v1 provenance attestation present; `@meddleware/seal-policies-sui@0.0.7` also attested |
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

**Severity:** Medium   **Disposition:** RESOLVED (0.0.16, `affd00b`; the optional pointer-prefix check is ADJUDICATED; `gateOperators` test gap is F25)
**Where:**

- `src/sealed-content.ts:176-246` (`listSealedContent` filters by gate only);
- `SealedContentPointer.publisher` is exposed but never used;
- README "Sealed-content discovery";
- `SECURITY.md` (no authenticity statement).

Consumer: seal-ui `src/sealed-content.ts` lists them unfiltered.

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
6. Bump seal-ui in the same release.

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
- seal-ui `src/sealed-content.ts` lists operator-only pointers by default (`gateOperators`); `includeOthers`
  is an explicit "every publisher" view. It consumes seal-client `^0.0.19`.
- Tests: `tests/sealed-content.test.ts` "lists only pointers published by the given addresses, on the full
  node and the indexer" and "compares publishers normalised, and lists everything when no filter is given".
- Remediation item 4 (drop a pointer whose `sealId` prefix differs from its `gateId`) was not implemented:
  ADJUDICATED. `decrypt` already runs `verifyId` against the pointer's `gateId`, so an inconsistent pointer
  fails closed at decrypt instead of showing content.
- The library default stays unfiltered by design: it cannot know a gate's publishing wallet, so the filter
  is the caller's choice and the documented default for UIs. `gateOperators` has no hermetic test (F25).

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
   `access_gate` dependency, or `seal-policies-sui` can add it to `deployments.json`.
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
  `access_gate` package (`0xa55789…` and older) are refused before anything is sealed. seal-ui passes
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
- The seal-ui datetime input bounds this in practice; library callers have no guard.

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

**Severity:** Low   **Disposition:** MITIGATED (hermetic `encrypt` tests 0.0.16; weekly live run 0.0.17; the live nft-gate negatives are DEFERRED — maintainer-only, Section D)
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
- Still missing: a live nft-gate decrypt round trip with negatives (wrong gate, exhausted or missing pass,
  wrong namespace, paused gate). It needs a funded testnet wallet holding a pass for a test gate, which is
  maintainer-only. DEFERRED to the Section D pre-mainnet gate; only "too early" is exercised live today.

### F11 — The README's mainnet guidance contradicts ADR-0002 and the package's own invariants

**Severity:** Low   **Disposition:** RESOLVED (0.0.16, `affd00b`)
**Where:** `README.md:73-76`:

> "On mainnet, use the verified committee behind the Mysten mainnet aggregator at `threshold: 1`;
> that aggregator needs an Enoki API key, passed per server as `{ apiKeyName: 'X-API-Key', apiKey }`."

**Issue:** This contradicts three other sources:

- `CLAUDE.md`: "an API key in a browser bundle is public: MeddleWare's apps use keyless servers only
  (workspace ADR-0002 — mainnet is three Open-mode servers at threshold 2)";
- seal-ui's mainnet defaults (three independent operators, t = 2);
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
bundle is public. It matches `CLAUDE.md` and seal-ui's defaults.

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
- seal-ui's testnet default (one aggregator plus two independent Mysten servers) therefore runs with
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
S6 option). seal-ui's testnet default (aggregator plus two independent servers) is still mixed and
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
time-lock manifest, which has no params to check". seal-ui's `manifest-guard.ts` passes its registry.
Without a registry the guard is still shape-only plus hex `id`, by design.

### F15 — Discovery robustness inherited from access-gate-client

**Severity:** Info   **Disposition:** RESOLVED (0.0.17, `cfd4a5e`; reader fixes arrive through `access-gate-client` ^0.0.8)
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
(https-only, timeout, body cap, checked page shape) come from `@meddleware/access-gate-client` `^0.0.8`;
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
- `seal-policies-sui`'s overview says such content "still decrypts".

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

### F17 — No client-side mitigation for frozen transferable passes (`seal-policies-sui-audit.md` F16)

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
`seal-policies-sui-audit.md`.

### F18 — Packaging and CI details

**Severity:** Info   **Disposition:** RESOLVED (0.0.16–0.0.17; the missing `engines` field is ADJUDICATED)
**Where:** `package.json`; `.github/workflows/*.yml`.

- **No declarations.** No `.d.ts` and no `types` condition, unlike nft-gate-client and
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
- **`engines`:** still absent. ADJUDICATED: no sibling library declares it (only apps do), CI runs Node 24
  LTS, and `engines` would only warn consumers.
- **CLAUDE.md** dependency version: still stale, tracked in F20.

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

**Severity:** Info   **Disposition:** MITIGATED (0.0.17; two cosmetic residuals below, to be fixed with the next patch)

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
  - can be cleared with `clearSession`, which seal-ui calls on disconnect and account switch.
- Nonces come from `crypto.getRandomValues`.

### F23 — Positive: IDs, discovery decoding and release chain

**Severity:** Positive

- **Generated IDs.** `./deployments` is generated from the exactly pinned, provenance-attested
  `@meddleware/seal-policies-sui@0.0.7`, with HEX_ID validation and `check:deployments` in CI and in
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
  (verified for 0.0.19); tag == version; idempotent publish; the tag workflow runs the full CI workflow
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
this; the project's own app (seal-ui) configures the option from the `access_gate` deployment.

**Remediation / evidence:** ADJUDICATED. `encrypt` needs only the key servers' public keys today; making
the full-node read mandatory would add a dependency on a full node to every nft-gate encryption. The option and its effect are documented (README, `SECURITY.md`, config docs).
Revisit if a consumer other than seal-ui appears: a `requireGateCheck` switch that throws when the option
is missing would close the gap without making the read the default.

### F25 — `gateOperators` has no hermetic test

**Severity:** Low   **Disposition:** ACCEPTED-RISK (a thin wrapper over a tested reader; add the test with the next patch)
**Where:** `src/operators.ts`; `tests/` (no reference to `gateOperators`).

**Issue:**

- `gateOperators` is the F6 remediation helper and seal-ui's default discovery path. The unit suite does not
  call it: the publisher filter is tested with literal addresses (`tests/sealed-content.test.ts`), and
  seal-ui's tests mock the function.
- The `fetchGate` read it relies on is tested in access-gate-client, but this wrapper's own behaviour
  (throws for a non-`Gate`, de-duplicates and normalises, merges `extra`) is unpinned.

**Impact:** a regression could list too few operators (the UI shows nothing) or, if the recipient were
dropped from the set, too many publishers. Authorship is already out of the confidentiality path, and the
live weekly run does not cover it.

**Remediation / evidence:** add a test with a stubbed client: a gate of the linked package returns its
`payment_recipient` plus normalised `extra` without duplicates; a look-alike gate and a missing object
throw.

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
| I12 | **Discovery is display-only; callers can restrict it to trusted publishers** | `listSealedContent({ publishers })`, `gateOperators` (`operators.ts`) | publisher-filter tests in `sealed-content.test.ts`; `gateOperators` itself unpinned (F25) | HOLDS — the library default is unfiltered by design (F6); seal-ui lists operator-only |
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
| `@meddleware/access-gate-client` | `^0.0.8` (0.0.8) | gate suggestions, gate check, operator lookup; indexer reader | provenance attested | its reader findings are tracked in `access-gate-client-audit.md` (F15) |
| `@meddleware/seal-policies-sui` (dev) | `0.0.7` exact | ID generation (build time) | provenance attested | source of every target |
| typescript / vitest / eslint (dev) | `~6.0.3` / `~5.0.2` / `^10.11.0` | build/test | clean | |
| Key-server committee | consumer config | decrypt — **fails closed** | n/a | B.SEAL-1 |
| Sui full node | consumer client | PTB object resolution; event reads — fails closed (throws) | n/a | |
| Read-indexer (optional) | consumer URL | discovery — first page falls back; cursor pages fail | n/a | display only |

**SEAL lens B.1 rows:**

| Item | Record |
| --- | --- |
| Key servers (per network) | consumer-configured. Defaults in seal-ui: testnet Mysten aggregator committee + 2 Mysten Open servers; mainnet Overclock, NodeInfra, H2O Nodes (Open) — fails closed |
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
| `@meddleware/access-gate-client` | `^0.0.8` | — | — |
| `typescript` / `vitest` | — | `~6.0.3` / `~5.0.2` | — |

### B.2 Publish authority, capabilities & secret custody

| Authority / secret | Where | Custody | Gates | Rotation |
| --- | --- | --- | --- | --- |
| npm publish `@meddleware/seal-client` | `npm-publish.yml` (tag `v*`) | GitHub OIDC → npm trusted publisher; `--provenance` | releases | n/a |
| Key-server API keys | caller config (`apiKey`) | **public by design** in browsers (documented) | aggregator access | caller's; unused by Meddleware apps (ADR-0002) |
| Keys / capabilities | — | none held; signing is the caller's wallet | — | — |

#### CI & release integrity

| Item | Holds? | Evidence |
| --- | --- | --- |
| Actions pinned | Yes | SHA pins in both workflows |
| Least privilege | Yes | `contents: read`; `id-token: write` only on `publish-npm` |
| OIDC trusted publishing | Yes | SLSA v1 attestation for 0.0.19 (`npm view`, 2026-10-09) |
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
| `src/deployments.ts` (generated) | testnet | `0x0c8f7349…773d` / same / `0xee0403ba…7d1a` | original-id / published-at / PolicyConfig | Y — `check:deployments` vs `seal-policies-sui@0.0.7` (`Published.toml` v1 = latest record; republished 2026-10-09, superseding `0x61c4aa…`, now immutable) |
| `tests/integration/abi-drift.integration.test.ts` | testnet | asserts published-at is the latest of `listPackageVersions(originalId)` | live | passed 2026-10-09 against the new package (`SEAL_TESTNET=1`, 3 files, 9 tests); weekly in `live.yml` (F10) |
| `src/providers/timelock.ts` | all | `0x6` | Clock | system object |
| Consumers (seal-ui) | testnet | `sealPoliciesDeployment(net)` | — | Y by construction |

### B.SC-2 Coupling table

| Move function (`seal_policies`) | Builder / provider | Test asserting target + arguments |
| --- | --- | --- |
| `nft_gate::seal_approve(vector<u8>, &PolicyConfig, &Gate, &AccessNFT)` | nft-gate `buildApprove` | `passes (id, PolicyConfig, gate, nft) in that order` |
| `nft_gate::seal_approve_soulbound(…, &SoulboundAccessNFT)` | nft-gate `buildApprove` (`soulbound: true`) | `selects the soulbound entry when requested` |
| `timelock::seal_approve(vector<u8>, &PolicyConfig, &Clock)` | time-lock `buildApprove` | `builds a timelock seal_approve move call over the Clock` (object order asserted) |
| `sealed_content::publish(&PolicyConfig, ID, String, String, String, &mut TxContext)` | `buildPublishSealedContentTx` / `…Transaction` | `PolicyConfig (version gate) is the first argument`; limits tests |

Signatures were cross-checked against `seal-policies-sui/sources/*.move` at `0726070` (first pass) and re-checked at 2026-10-09 by the live ABI-drift test against the new package (`a03a532`, 0.0.7); they match.

### B.SC-3 Cross-implementation parity

| Behaviour | Client | Move | Shared vector / test |
| --- | --- | --- | --- |
| nft-gate prefix | `objectIdBytes` | `object::id_bytes` | yes (B.1) |
| time-lock encoding | `u64beBytes` | BE decode over 8 bytes | yes; the client now rejects values above u64 (F8) |
| `sealed_content` string limits | `SEALED_CONTENT_LIMITS` (UTF-8 bytes) | `MAX_*_BYTES` (`String.length()` bytes) | hand-mirrored tests on both sides |
| `SealedContentPublished` layout | BCS struct | Move struct | live decode test (weekly `live.yml`) |

### B.SEAL-1 Committee readiness (consumer configuration; owned by seal-ui and ADR-0002)

| Network | Servers (operators) | Mode | t | Change process | Existing ciphertexts |
| --- | --- | --- | --- | --- | --- |
| testnet | Mysten committee (aggregator) + Mysten Open ×2 | mixed | 2 | seal-ui env | bound to the servers in their header; move them with `describeCiphertext` + `sealedUnderServers` + re-seal (README) |
| mainnet | Overclock, NodeInfra, H2O Nodes (Open, keyless) | independent, Open mode 2-of-3 | 2 | seal-ui env + ADR-0002 | same |

The client validates `t ≤ total weight`. It does not require t ≥ 2, so a consumer can still choose t = 1;
the README no longer suggests it (F11), and MeddleWare's apps use t = 2 (ADR-0002).

### B.SEAL-2 Discovery registries

| Requirement | Holds? | Evidence |
| --- | --- | --- |
| Paginated with a cursor | Yes | `listSealedContent` cursors, source-bound |
| Filtered client-side | Yes | by gate, and by publisher through `publishers` / `gateOperators` (F6); the library default is unfiltered, seal-ui lists operator-only |
| Label size bounded | Yes | on-chain 256 bytes; mirrored in the builder |
| Rendered as untrusted data | consumer's (VUE lens, seal-ui) | — |

---

## Section C — Test-coverage & hermetic/live split

### C.1 Coverage grade — A- (97/97 hermetic tests, 10 files; coverage % not re-measured, 2026-10-03 figures: 95.13% statements, 91.25% branches, 96.62% lines for the 77-test suite)

| Dimension | Assessment |
| --- | --- |
| Happy path | Encrypt (namespace binding, threshold, gate and soulbound checks), decrypt (mocked SDK), providers, builders, manifests, discovery (RPC and indexer), deployments, ciphertext description. |
| Error path | Identity, package and namespace mismatches; approve-only violations; threshold; manifests (hex id, registry, narrowed params); non-hex; layout lengths; plain-http indexer; look-alike events; empty, zero, non-gate and transferable-gate ids; u64 overflow and past unlock; prototype-key network; undecodable indexer rows; scan cap; registry replace. |
| Boundary | String limits (UTF-8); nonce widths; 2⁶⁴ − 1 accepted and 2⁶⁴ rejected; TTL margin with a slow signer; concurrent mints. |
| Security-relevant | Strong on pre-request checks and the encrypt binding; publisher filtering (literal addresses). **Missing:** `gateOperators` itself (F25). |

Coverage was not re-measured: the coverage plugin is not installed. The rows that were uncovered at the first pass
(`controller.ts` `encrypt`, the u64 branches in `bytes.ts`) now have the tests named in F8 and F10.

**Test layers:**

| Layer | Files | Gating variable | In CI? |
| --- | --- | --- | --- |
| Unit (offline) | 10 files, 97 tests | — | yes (`node-ci.yml`, and as the publish `verify` job) |
| Integration (live testnet: timelock round trip, ABI drift, sealed-content decode) | `tests/integration/*.integration.test.ts` (3 files, 9 tests) | `SEAL_TESTNET=1` (+ optional `GRPC_TESTNET_URL`) | weekly (`live.yml`) |

### C.2 Hermetic vs. live paths

| Path | Hermetic? | Deferred to | Tracking |
| --- | --- | --- | --- |
| Key-server committee behaviour, share consistency, full-node skew | no (live-only, per the SEAL lens) | integration suite (time-lock), weekly | F10 |
| nft-gate decrypt with a real pass (and negatives) | no | none yet: needs a funded testnet wallet and a test gate (maintainer-only; Section D pre-mainnet) | F10 |
| `encrypt` namespace binding | yes | `tests/controller.test.ts` | F10 |
| ABI of the published package | arity table | live drift, weekly | F10, F18 |
| `SealedContentPublished` layout vs chain | self-encoded | live decode, weekly | — |

---

## Section D — Deployment-readiness gates

### pre-localnet

- [x] identity vectors green on both sides; approve PTBs transaction-kind-only — F21
- [x] every provider verifies its identity layout client-side — F5
- [x] strict type-check, lint, unit tests green; `npm audit` 0 — 97/97, tsc, eslint, audit 0 (2026-10-09)
- [x] identity inputs validated (gate type, soulbound, u64 range, not already unlocked) — F7, F8, F17 (the gate
  and soulbound checks run when `accessGateOriginalId` is set: F24, ADJUDICATED)

### pre-testnet *(the package is in use on testnet)*

- [x] original-id (namespace) and published-at (approve target) recorded and used — F21; `encrypt` binding
  pinned by a hermetic test (F10)
- [x] threshold ≤ configured weight; SessionKey cleared on account switch and disconnect (seal-ui)
- [ ] live decrypt round trip **with negatives** (wrong gate, exhausted/missing pass, too early,
  wrong namespace, paused gate) — F10. DEFERRED, maintainer-only: needs a funded testnet wallet holding a
  pass for a test gate; only "too early" runs live today.
- [x] live suite in CI on a schedule — weekly `live.yml` (F10, F18)
- [x] npm package with provenance; shared-dependency matrix aligned — 0.0.19, SLSA v1 attestation

### pre-mainnet

- [ ] mainnet deployment recorded (seal-policies-sui is unpublished on mainnet); unknown networks fail
  closed (F12, done) — mainnet-blocked: mainnet publication (`OPERATOR_TASKS.md` "Mainnet release custody")
- [ ] mainnet key servers chosen and verified; `verifyKeyServers` on; t decided — decided (decision):
  Overclock, NodeInfra and H2O Open mode 2-of-3 in seal-ui, README follows ADR-0002 (F11), `verifyKeyServers`
  is on for that configuration (F13). Not ticked: mainnet-blocked, the operator terms are a maintainer item
  (`OPERATOR_TASKS.md` "Mainnet Seal key servers").
- [ ] policy-package UpgradeCap custody executed (seal-policies-sui OQ3) — disclosed in `SECURITY.md`; the
  new UpgradeCap is with the deploy key; multisig transfer and burn are the pre-mainnet process
  (`OPERATOR_TASKS.md` "Mainnet release custody")
- [x] discovery can be authenticated by publisher — F6 (`publishers`, `gateOperators`; seal-ui is operator-only)
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
  - this is the domain client for `seal_policies`; seal-ui delegates to it and holds no ID literals;
  - it reads `access_gate` only through access-gate-client;
  - call targets use published-at, and types, events and the namespace use original-id, both
    recorded;
  - the `access_gate` id used for suggestions and the encrypt-time gate check is caller-supplied, not
    derived from the one `seal_policies` links (F7); a wrong id fails closed.
- **Pre-v0.2 policy:** F7, F8, F9, F12, F14 and F16 changed exported types without shims (breaking changes
  in 0.0.16–0.0.18, patch-only bumps until go-live; seal-ui bumped in step, consuming `^0.0.19`).
- **Shared with sibling audits:**
  - access-gate-client F5 / F7 / F8 ↔ F12 / F15;
  - seal-policies-sui F4 / OQ4 ↔ F6;
  - seal-policies-sui F16 / OQ9 ↔ F17;
  - seal-policies-sui F27 / OQ11 ↔ F16.

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
   library default is unfiltered by design, and `gateOperators` has no hermetic test (F25).
7. MUST throw for any network without its own recorded deployment — holds (F12, `Object.hasOwn`).
8. MUST document only key-server configurations consistent with ADR-0002 — holds (F11).

**SEAL lens baseline:**

| ID | Holds? | Evidence |
| --- | --- | --- |
| SEAL-M1 | yes (encrypt pinned hermetically) | I1, F10 |
| SEAL-M2 | yes | I2 |
| SEAL-M3 | yes | I4 |
| SEAL-M4 | t ≤ servers yes; ≥ 2 independent operators is the consumer's (seal-ui yes, mainnet 2-of-3 Open mode; README follows ADR-0002 — F11); `verifyKeyServers` off in mixed configs, visible through `verifiesKeyServers` (F13) | B.SEAL-1 |
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
  path (F6). [Done: both exist; the default for UIs is seal-ui's operator-only listing, the library
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
  done. The nft-gate negatives: DEFERRED, maintainer-only.]
- **S6** MAY warn at construction when `threshold === 1` or when `verifyKeyServers` is disabled by a
  mixed configuration (F11, F13). [Not added; `verifiesKeyServers` exposes the setting.]

## Open questions

All four are answered; the answers are decisions, not open items.

- **OQ1** Discovery authenticity (F6): (a) client-side publisher filtering, (b) the curated on-chain
  `publish_curated` from `seal-policies-sui` OQ4, (c) content signing in the manifest. **Answered: (a).**
  `publishers` and `gateOperators` shipped in 0.0.16 and seal-ui lists operator-only pointers; (b) and (c) are
  not planned.
- **OQ2** Should `encrypt` read chain state (F7: gate type; F17: soulbound) and refuse? **Answered: yes, as an
  opt-in.** With `accessGateOriginalId` set it reads the gate and refuses; without it, encryption needs only
  the key servers' public keys (F24, ADJUDICATED).
- **OQ3** Support legacy `seal_policies` namespaces (F16)? **Answered: no**; superseded packages are
  republished, not migrated.
- **OQ4** Ship `.d.ts` declarations like the sibling SDKs? **Answered: yes**, since 0.0.16 (F18).

## Risks

- **Committee trust:** ≥ t colluding key servers decrypt everything. Fewer than t online means no one
  can decrypt. Consumer configuration decides both.
- **Upgrade authority:** until the `seal_policies` UpgradeCap is burned, access to existing content can
  change. Disclosed in `SECURITY.md`; the live UpgradeCap is with the deploy key until the pre-mainnet custody
  process (`OPERATOR_TASKS.md` "Mainnet release custody").
- **Authenticity:** decrypted content is authenticated only by the namespace, not the author (F6). The
  publisher filter is the caller's choice, and `gateOperators` has no hermetic test (F25).
- **Irrecoverable or open sealing:** content bound to a wrong gate, or sealed to a transferable-pass gate,
  cannot be repaired after storage. The inputs are refused only when `accessGateOriginalId` is configured
  (F7, F17, F24); a wrapped unlock time is always refused (F8).
- **Live nft-gate coverage:** the decrypt negatives against a real pass are unproven live (F10).
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
    `check:deployments` (`seal-policies-sui@0.0.7`) clean; `SEAL_TESTNET=1 npm run test:integration`
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

## Pre-save consistency checklist (this pass)

- [x] Section A ↔ findings — no GAP rows remain; rows cite F6, F7, F8, F9, F10, F12, F13, F14, F19, F24, F25.
- [x] Finding header ↔ body — consistent; every disposition carries evidence or a named gate.
- [x] Template line — base + SEAL + SUI_CLIENT + TS with registry dates; untriggered lenses named.
- [x] Closing four-part structure — present (normative, suggestions, open questions, risks).
- [x] Section D ↔ dispositions — unticked items are mainnet-blocked or maintainer-only, and say which.
- [x] Executive summary ↔ dispositions and ceiling (no finding open above Low).
- [x] C.1 counts — tests measured 2026-10-09 (97/97); coverage percentages are the 2026-10-03 figures.
- [x] Re-verification log entry added (2026-10-03 and 2026-10-09).
