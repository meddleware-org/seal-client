// Abort codes of the `seal_policies` Move modules, keyed by (module, code).
//
// The small codes overlap: `nft_gate`, `timelock`, `config` and `sealed_content` all use `1`, and `access_gate`
// reuses small integers too, so a bare code means nothing. A client that wants to tell a user "this gate is
// paused" or "this package version was retired" must read the module (and, when it can, the package) as well.
// The table below mirrors the constants in `seal-policies-sui/sources/*.move` (a test reads them when that
// checkout is next to this one).

/** A `seal_policies` module that can abort. */
export type PolicyModule = 'config' | 'nft_gate' | 'timelock' | 'sealed_content'

/** One abort code of a `seal_policies` module. */
export interface PolicyAbort {
  module: PolicyModule
  code: number
  /** The Move constant's name. */
  name: string
  /** What the abort means. */
  meaning: string
  /** What a client should do or tell the user. */
  advice: string
}

/** Every abort code the `seal_policies` modules define. */
export const POLICY_ABORTS: readonly PolicyAbort[] = [
  {
    module: 'config',
    code: 1,
    name: 'E_WRONG_VERSION',
    meaning: 'The shared PolicyConfig names a different package version than the code that was called: the called version has been retired.',
    advice: 'Rebuild the transaction against the current published-at of the policy package.',
  },
  {
    module: 'config',
    code: 2,
    name: 'E_NOT_UPGRADE',
    meaning: 'migrate only moves forward: the PolicyConfig is already at or past this package version.',
    advice: 'Administrative; not shown to end users.',
  },
  {
    module: 'nft_gate',
    code: 1,
    name: 'E_ID_NOT_NAMESPACED',
    meaning: "The Seal identity is not namespaced to this gate (its first 32 bytes must equal the gate's object id).",
    advice: 'The stored identity or the gate in the manifest is wrong; do not retry.',
  },
  {
    module: 'nft_gate',
    code: 2,
    name: 'E_WRONG_GATE',
    meaning: 'The presented pass was not minted from this gate.',
    advice: 'Ask the user for a pass of the gate the content is sealed to.',
  },
  {
    module: 'nft_gate',
    code: 3,
    name: 'E_EXHAUSTED',
    meaning: 'A single-use pass with zero remaining uses cannot authorise.',
    advice: 'Tell the user the pass is used up and offer to buy another.',
  },
  {
    module: 'nft_gate',
    code: 4,
    name: 'E_GATE_PAUSED',
    meaning: "The gate is paused and its policy says pausing blocks decryption.",
    advice: 'Tell the user access resumes when the operator unpauses the gate, not that the pass is missing or invalid.',
  },
  {
    module: 'timelock',
    code: 1,
    name: 'E_BAD_ID',
    meaning: 'The identity is too short to carry an 8-byte unlock timestamp.',
    advice: 'The stored identity is malformed; do not retry.',
  },
  {
    module: 'timelock',
    code: 2,
    name: 'E_TOO_EARLY',
    meaning: 'The unlock time has not passed yet.',
    advice: 'Tell the user when the content unlocks.',
  },
  {
    module: 'sealed_content',
    code: 1,
    name: 'E_LABEL_TOO_LONG',
    meaning: 'The label exceeds the maximum length.',
    advice: 'Shorten the label.',
  },
  {
    module: 'sealed_content',
    code: 2,
    name: 'E_BLOB_ID_TOO_LONG',
    meaning: 'The blob id exceeds the maximum length.',
    advice: 'The blob id is malformed.',
  },
  {
    module: 'sealed_content',
    code: 3,
    name: 'E_SEAL_ID_TOO_LONG',
    meaning: 'The Seal id exceeds the maximum length.',
    advice: 'The Seal identity is malformed.',
  },
]

/** The abort of `module` with `code`, or undefined when `seal_policies` defines none. */
export function describePolicyAbort(module: string, code: number | bigint | string): PolicyAbort | undefined {
  let wanted: bigint
  try {
    wanted = BigInt(code)
  } catch {
    return undefined
  }
  return POLICY_ABORTS.find((a) => a.module === module && BigInt(a.code) === wanted)
}

/** A Move abort read out of an error, a message or a structured execution status. */
export interface ParsedMoveAbort {
  code: bigint
  module?: string
  /** The package the abort happened in, as written in the source (not normalised). */
  package?: string
}

const HEX_ADDRESS = /(0x[0-9a-fA-F]+)/

/**
 * Read a Move abort out of what a Sui client or a key server reports. Understood:
 * - a structured status `{ abortCode, location?: { package?, module? } }` (the clients' `MoveAbort`);
 * - an `Error` (its `message`, then its `cause` chain) or a string holding the clients' message,
 *   `MoveAbort in 1st command, abort code: 4, in '0x…::nft_gate::seal_approve' (instruction 7)`;
 * - the older form `MoveAbort(MoveLocation { module: ModuleId { address: 0x…, name: Identifier("nft_gate") }, … }, 4)`.
 * Anything else (including a message without a code) yields undefined.
 */
export function parseMoveAbort(input: unknown): ParsedMoveAbort | undefined {
  return parse(input, 0)
}

function parse(input: unknown, depth: number): ParsedMoveAbort | undefined {
  if (depth > 5 || input === null || input === undefined) return undefined
  if (typeof input === 'string') return parseText(input)
  if (typeof input !== 'object') return undefined
  const o = input as Record<string, unknown>
  if ('abortCode' in o) {
    const code = toBigInt(o.abortCode)
    if (code === undefined) return undefined
    const loc = (typeof o.location === 'object' && o.location !== null ? o.location : {}) as Record<string, unknown>
    const out: ParsedMoveAbort = { code }
    if (typeof loc.module === 'string') out.module = loc.module
    if (typeof loc.package === 'string') out.package = loc.package
    return out
  }
  // a wrapper such as { MoveAbort: { abortCode, location } }
  if (typeof o.MoveAbort === 'object') {
    const inner = parse(o.MoveAbort, depth + 1)
    if (inner) return inner
  }
  if (typeof o.message === 'string') {
    const fromMessage = parseText(o.message)
    if (fromMessage) return fromMessage
  }
  if ('cause' in o) return parse(o.cause, depth + 1)
  return undefined
}

function toBigInt(v: unknown): bigint | undefined {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v)
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return BigInt(v.trim())
  return undefined
}

function parseText(text: string): ParsedMoveAbort | undefined {
  // `abort code: 4, in '0xPKG::nft_gate::seal_approve'`
  const modern = /abort code:\s*(\d+)(?:[^'\n]*?in '([^':]+)::([A-Za-z_][A-Za-z0-9_]*)(?:::[A-Za-z0-9_]+)?')?/.exec(text)
  if (modern?.[1]) {
    const out: ParsedMoveAbort = { code: BigInt(modern[1]) }
    if (modern[3]) out.module = modern[3]
    if (modern[2] && HEX_ADDRESS.test(modern[2])) out.package = modern[2]
    return out
  }
  // `MoveAbort(MoveLocation { module: ModuleId { address: 0x…, name: Identifier("nft_gate") }, … }, 4)`
  const legacy =
    /MoveAbort\(\s*MoveLocation\s*\{\s*module:\s*ModuleId\s*\{\s*address:\s*(0x[0-9a-fA-F]+)\s*,\s*name:\s*Identifier\("([A-Za-z_][A-Za-z0-9_]*)"\)\s*\}[\s\S]*?\}\s*,\s*(\d+)\s*\)/.exec(
      text,
    )
  if (legacy?.[1] && legacy[2] && legacy[3]) {
    return { code: BigInt(legacy[3]), module: legacy[2], package: legacy[1] }
  }
  return undefined
}

function sameAddress(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/^0x/, '').replace(/^0+/, '')
  return norm(a) === norm(b)
}

/**
 * Name a `seal_policies` abort. The abort is read with {@link parseMoveAbort} and looked up by
 * (module, code), never by the code alone.
 *
 * Pass `policyPackageIds` (the policy package's original id and published-at) to be sure the abort came from
 * `seal_policies` and not from a package that has a module of the same name: an abort whose package is not in
 * the list, or whose package is not reported at all, is then not named. Without it any package's
 * `nft_gate`/`config`/`timelock`/`sealed_content` module matches, which is only as safe as the caller's
 * knowledge of what it called.
 *
 * Returns undefined when the input holds no abort, the module is not a `seal_policies` module (for example an
 * `access_gate` abort) or the code is not defined.
 */
export function classifyPolicyAbort(
  input: unknown,
  options: { policyPackageIds?: readonly string[] } = {},
): PolicyAbort | undefined {
  const abort = parseMoveAbort(input)
  if (!abort?.module) return undefined
  const ids = options.policyPackageIds
  if (ids !== undefined) {
    const pkg = abort.package
    if (pkg === undefined || !ids.some((id) => sameAddress(id, pkg))) return undefined
  }
  return describePolicyAbort(abort.module, abort.code)
}
