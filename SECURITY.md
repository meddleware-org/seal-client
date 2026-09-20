# Security Policy

## Scope

This policy covers security issues in the `@meddleware/seal-client` package source
(`src/**`) — the `SealController` encrypt/decrypt orchestration, the `PolicyRegistry`, the
identity byte encoders (`src/bytes.ts` and the policy providers), and the SessionKey lifecycle.

It does not cover:

- **Seal** or the `@mysten/seal` / `@mysten/sui` SDKs (report upstream to
  [Mysten Labs](https://github.com/MystenLabs)) — the threshold key-server committee holds all
  decryption keys and independently dry-runs `seal_approve` before releasing any share
- The on-chain `seal-policies-sui` Move package (see that repo's `SECURITY.md`)
- A consuming application's key-server / committee configuration, or its decision to register a
  third-party policy provider (a registered provider runs unsandboxed in the host realm)

## Security model (invariants)

These invariants are load-bearing. A report demonstrating that any is violated is in scope and
treated as high severity:

1. **The controller never holds, derives, persists, or logs decryption keys or plaintext.** Keys
   live with the committee; plaintext is returned to the caller by Seal only after a successful
   on-chain `seal_approve` dry-run.
2. **SessionKeys are in-memory only, minted once per address, and never reused across addresses.**
   They expire at least one minute before the server-side TTL.
3. **Identity bytes are namespaced and must match the on-chain decoders bit-for-bit.** `nft_gate` =
   `[32-byte gate id][16-byte nonce]`; `timelock` = `[8-byte BE unlock_ms][8-byte nonce]`.
   `src/bytes.ts` is the single source of truth on the client side.
4. **Nonces are CSPRNG-generated internally** (`crypto.getRandomValues`), never attacker-supplied.

### Nonce widths per policy (why they differ)

The nonce guarantees each ciphertext gets a **distinct** Seal identity even when the
policy-determined prefix repeats. The Seal identity is **not secret** — it is stored verbatim in the
manifest — so the nonce is a *uniqueness / domain-separation* budget, not a secrecy one.

| Policy | Identity layout | Nonce width | Why |
| --- | --- | --- | --- |
| `nft-gate` | `[32-byte gate id][16-byte nonce]` | 16 B (128-bit) | The gate id is a stable, public value reused for every ciphertext under that gate, so the nonce carries *all* per-ciphertext uniqueness — sized for negligible birthday collision across an unbounded population per gate. |
| `time-lock` | `[8-byte BE unlock_ms][8-byte nonce]` | 8 B (64-bit) | The prefix is a low-entropy unlock timestamp, frequently shared across documents. 64 bits comfortably disambiguates the per-unlock-time population and keeps the identity compact/symmetric with the 8-byte timestamp. |

Both widths are fixed by the matching on-chain `seal_policies` module layout and are locked by
`tests/providers.test.ts` ("nonce widths (F2)"); changing a width requires a coordinated change to
the Move module and the conformance vectors.
5. **No secrets or protocol addresses are hardcoded** in shipped source (the only literal is the
   canonical Sui Clock `0x6`).

## Supported versions

Only the latest published npm version receives security fixes.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report vulnerabilities by emailing **<security@meddleware.co.uk>**. Include:

- A description of the vulnerability and its impact
- Steps to reproduce or a proof-of-concept (if available)
- The package version or commit SHA you tested against

You will receive an acknowledgement within **3 business days** and a resolution plan within
**14 days** for confirmed issues. Critical issues (CVSS ≥ 9.0) are prioritised for same-day
acknowledgement.

## Disclosure

Once a fix is released, a security advisory will be published on the GitHub repository. Reporters
may be credited by name unless they prefer to remain anonymous.
