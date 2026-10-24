// Explain why a decrypt was refused, by simulating the approve PTB as the requester.
//
// The public Seal key servers answer a refused request with a generic error that carries no Move abort
// (`NoAccessError`: "User does not have access to one or more of the requested keys"; for a pass the requester
// does not own, `InvalidParameterError`), so `classifyPolicyAbort` cannot read a failed `decrypt`. The same
// approve PTB, dry-run by the client as the requester, does abort with the real code. This module does that
// simulation: read-only (`simulateTransaction`), no signing, no gas spent.
import type { Transaction } from '@mysten/sui/transactions'
import { classifyPolicyAbort, parseMoveAbort } from './aborts.js'
import type { PolicyAbort } from './aborts.js'

/** The slice of a Sui core client the explanation needs (a `SuiGrpcClient` satisfies it). */
export interface RefusalClient {
  core: {
    simulateTransaction(options: { transaction: Transaction; include?: { effects?: boolean } }): Promise<unknown>
  }
}

/** Not a Move abort: the simulation was refused because the requester does not own the presented object. */
export const REASON_NOT_OWNER = 'NOT_OWNER'

/** What {@link explainApproveRefusal} concluded. */
export interface RefusalExplanation {
  /**
   * - `allowed`: the approve call succeeds for this address, so the policy is not what refused (look at the key
   *   servers: unreachable, fewer than the threshold answering, or a full node that has not seen a new object yet).
   * - `refused`: the approve call aborts (or the requester cannot present the object): the key servers refuse too.
   * - `unknown`: the simulation could not be run or its result could not be read; see `cause` / `raw`.
   */
  kind: 'allowed' | 'refused' | 'unknown'
  /**
   * `refused` only: the name of the policy abort (`E_GATE_PAUSED`, `E_EXHAUSTED`, `E_WRONG_GATE`, `E_TOO_EARLY`,
   * `E_WRONG_VERSION`, …), or {@link REASON_NOT_OWNER}. Absent when the abort is not a `sealed_storage` abort
   * that this package knows.
   */
  reason?: string
  /** The Move module that aborted (`nft_gate`, `timelock`, `config`, …), when the abort names one. */
  module?: string
  /** The Move abort code, when it is a safe integer. */
  code?: number
  /** Human text suitable for a UI; always present. */
  message: string
  /** `refused` with a known abort: what a client should do (developer-facing, from {@link POLICY_ABORTS}). */
  advice?: string
  /** `unknown` only: the error that stopped the simulation (a network error, a failed build). */
  cause?: unknown
  /** The simulation's execution error (`refused`/`unknown`), for logs; its shape is the client's. */
  raw?: unknown
}

/** UI text per abort, keyed `module::NAME`. Every entry of {@link POLICY_ABORTS} has one (a test checks). */
const USER_MESSAGES: Readonly<Record<string, string>> = {
  'config::E_WRONG_VERSION': 'This sealed content was opened with an outdated version of the policy. Reload the app and try again.',
  'config::E_NOT_UPGRADE': 'The policy package version is not newer than the one in use.',
  'nft_gate::E_ID_NOT_NAMESPACED': 'This content does not belong to the gate it is being opened with.',
  'nft_gate::E_WRONG_GATE': 'This pass belongs to a different gate than the one this content is sealed to.',
  'nft_gate::E_EXHAUSTED': 'This pass has no uses left.',
  'nft_gate::E_GATE_PAUSED': 'Access is paused by the gate operator. It resumes when the gate is unpaused.',
  'timelock::E_BAD_ID': 'The stored identity of this content is malformed.',
  'timelock::E_TOO_EARLY': 'This content is still locked. It unlocks later.',
  'sealed_content::E_LABEL_TOO_LONG': 'The label is too long.',
  'sealed_content::E_BLOB_ID_TOO_LONG': 'The blob id is malformed (too long).',
  'sealed_content::E_SEAL_ID_TOO_LONG': 'The Seal identity is malformed (too long).',
}

/** The UI text for a known abort. */
export function refusalMessage(abort: PolicyAbort): string {
  return USER_MESSAGES[`${abort.module}::${abort.name}`] ?? abort.meaning
}

const NOT_OWNER_MESSAGE = 'The connected address does not own this pass.'
const NOT_OWNER_TEXT = /not signed by the correct sender|is owned by account address/i

/**
 * Simulate the approve transaction `tx` as `sender` and say why a decrypt would be refused.
 *
 * Call it AFTER a decrypt failed with `NoAccessError` / `InvalidParameterError` (or whenever the app wants the
 * reason up front); it is one `simulateTransaction` RPC and is never called by the library on its own. It
 * spends nothing and signs nothing. It does not throw: a refusal is a result, and an error while simulating
 * (network, a node that rejects the build) is returned as `kind: 'unknown'` with the error as `cause`.
 *
 * Pass `policyPackageIds` (the policy package's original id and published-at) so an abort from another package's
 * module of the same name is not named as a `sealed_storage` abort.
 */
export async function explainApproveRefusal(
  client: RefusalClient,
  tx: Transaction,
  options: { sender: string; policyPackageIds?: readonly string[] },
): Promise<RefusalExplanation> {
  let result: unknown
  try {
    tx.setSender(options.sender)
    result = await client.core.simulateTransaction({ transaction: tx, include: { effects: true } })
  } catch (error) {
    if (errorTexts(error).some((t) => NOT_OWNER_TEXT.test(t))) {
      return { kind: 'refused', reason: REASON_NOT_OWNER, message: NOT_OWNER_MESSAGE, raw: error }
    }
    return { kind: 'unknown', message: `Could not check the access policy: ${errorTexts(error)[0] ?? 'unknown error'}`, cause: error }
  }
  return readSimulation(result, options.policyPackageIds)
}

function readSimulation(result: unknown, policyPackageIds: readonly string[] | undefined): RefusalExplanation {
  const body = pick(result, 'Transaction') ?? pick(result, 'FailedTransaction')
  const status = pick(body, 'status')
  const success = status?.success
  if (success === true) {
    return {
      kind: 'allowed',
      message:
        'The access policy approves this address. If decryption still fails, the key servers are unreachable, too few answered, or they have not seen a newly created object yet; try again shortly.',
    }
  }
  if (success !== false) {
    return { kind: 'unknown', message: 'Could not read the result of the policy check.', raw: result }
  }
  const error = status?.error
  const parsed = parseMoveAbort(error)
  if (!parsed) {
    return { kind: 'unknown', message: 'The policy check failed for a reason other than a policy abort.', raw: error ?? status }
  }
  const named = classifyPolicyAbort(error, policyPackageIds ? { policyPackageIds } : {})
  const code = parsed.code <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed.code) : undefined
  const out: RefusalExplanation = { kind: 'refused', message: '', raw: error }
  if (parsed.module !== undefined) out.module = parsed.module
  if (code !== undefined) out.code = code
  if (named) {
    out.reason = named.name
    out.message = refusalMessage(named)
    out.advice = named.advice
  } else {
    out.message = `Access was refused by the policy (abort ${parsed.code}${parsed.module ? ` in ${parsed.module}` : ''}).`
  }
  return out
}

function pick(value: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = (value as Record<string, unknown>)[key]
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

/** The message of an error and of its `cause` chain. */
function errorTexts(error: unknown): string[] {
  const out: string[] = []
  let cur: unknown = error
  for (let i = 0; i < 5 && cur !== undefined && cur !== null; i++) {
    if (typeof cur === 'string') {
      out.push(cur)
      break
    }
    if (typeof cur !== 'object') break
    const o = cur as { message?: unknown; cause?: unknown }
    if (typeof o.message === 'string') out.push(o.message)
    cur = o.cause
  }
  return out
}
