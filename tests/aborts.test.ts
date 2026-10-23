import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { POLICY_ABORTS, classifyPolicyAbort, describePolicyAbort, parseMoveAbort } from '../src/aborts.js'

const POLICY = '0x' + '0c'.repeat(32)
const OTHER = '0x' + 'd7'.repeat(32)

/** The message the Sui clients build for a Move abort (`formatMoveAbortMessage`). */
const modern = (pkg: string, module: string, code: number) =>
  `MoveAbort in 1st command, abort code: ${code}, in '${pkg}::${module}::seal_approve' (instruction 7)`
/** The older Rust-debug form of the same abort. */
const legacy = (pkg: string, module: string, code: number) =>
  `MoveAbort(MoveLocation { module: ModuleId { address: ${pkg}, name: Identifier("${module}") }, function: 1, instruction: 7, function_name: Some("seal_approve") }, ${code}) in command 0`

describe('policy abort map (S7 / OQ5)', () => {
  it('names nft_gate abort 4 as a paused gate and config abort 1 as a retired package version', () => {
    expect(describePolicyAbort('nft_gate', 4)).toMatchObject({ name: 'E_GATE_PAUSED' })
    expect(describePolicyAbort('config', 1)).toMatchObject({ name: 'E_WRONG_VERSION' })
  })

  it('keys on (module, code): the same code means different things in different modules', () => {
    const ones = POLICY_ABORTS.filter((a) => a.code === 1).map((a) => `${a.module}:${a.name}`)
    expect(ones).toEqual([
      'config:E_WRONG_VERSION',
      'nft_gate:E_ID_NOT_NAMESPACED',
      'timelock:E_BAD_ID',
      'sealed_content:E_LABEL_TOO_LONG',
    ])
    expect(describePolicyAbort('timelock', 1)?.name).toBe('E_BAD_ID')
    // no (module, code) pair is listed twice
    const keys = POLICY_ABORTS.map((a) => `${a.module}:${a.code}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('knows nothing of a code the modules do not define, of another module, or of a non-number', () => {
    expect(describePolicyAbort('nft_gate', 5)).toBeUndefined()
    expect(describePolicyAbort('config', 3)).toBeUndefined()
    expect(describePolicyAbort('access_gate', 4)).toBeUndefined()
    expect(describePolicyAbort('nft_gate', 'four')).toBeUndefined()
    expect(describePolicyAbort('nft_gate', '4')?.name).toBe('E_GATE_PAUSED')
    expect(describePolicyAbort('nft_gate', 4n)?.name).toBe('E_GATE_PAUSED')
  })

  it('reads the clients message, the older debug form, a structured status and a wrapped error', () => {
    expect(parseMoveAbort(modern(POLICY, 'nft_gate', 4))).toEqual({ code: 4n, module: 'nft_gate', package: POLICY })
    expect(parseMoveAbort(legacy(POLICY, 'config', 1))).toEqual({ code: 1n, module: 'config', package: POLICY })
    expect(parseMoveAbort({ abortCode: '4', location: { package: POLICY, module: 'nft_gate' } })).toEqual({
      code: 4n,
      module: 'nft_gate',
      package: POLICY,
    })
    expect(parseMoveAbort({ MoveAbort: { abortCode: '2', location: { module: 'timelock' } } })).toEqual({ code: 2n, module: 'timelock' })
    const wrapped = new Error('decrypt failed', { cause: new Error(modern(POLICY, 'nft_gate', 3)) })
    expect(parseMoveAbort(wrapped)).toMatchObject({ code: 3n, module: 'nft_gate' })
  })

  it('reads nothing from text without an abort, and does not loop on a cyclic cause', () => {
    expect(parseMoveAbort('network down')).toBeUndefined()
    expect(parseMoveAbort(undefined)).toBeUndefined()
    expect(parseMoveAbort(42)).toBeUndefined()
    expect(parseMoveAbort({ abortCode: 'x' })).toBeUndefined()
    const a: { message: string; cause?: unknown } = { message: 'a' }
    a.cause = a
    expect(parseMoveAbort(a)).toBeUndefined()
  })

  it('classifies by (module, code) and the policy package when the caller supplies it', () => {
    const paused = modern(POLICY, 'nft_gate', 4)
    expect(classifyPolicyAbort(paused)?.name).toBe('E_GATE_PAUSED')
    expect(classifyPolicyAbort(paused, { policyPackageIds: [POLICY] })?.name).toBe('E_GATE_PAUSED')
    // zero-padding and case do not matter
    expect(classifyPolicyAbort(modern('0x' + POLICY.slice(2).toUpperCase(), 'nft_gate', 4), { policyPackageIds: [POLICY] })).toBeDefined()
    // a same-named module of another package is not ours
    expect(classifyPolicyAbort(modern(OTHER, 'nft_gate', 4), { policyPackageIds: [POLICY] })).toBeUndefined()
    // with the package list given, an abort that does not say where it happened is not named
    expect(classifyPolicyAbort({ abortCode: '4', location: { module: 'nft_gate' } }, { policyPackageIds: [POLICY] })).toBeUndefined()
    expect(classifyPolicyAbort({ abortCode: '4', location: { module: 'nft_gate' } })?.name).toBe('E_GATE_PAUSED')
  })

  it('does not name an access_gate abort that reuses a policy code', () => {
    expect(classifyPolicyAbort(modern(OTHER, 'access_gate', 4))).toBeUndefined()
    expect(classifyPolicyAbort(legacy(OTHER, 'access_gate', 1))).toBeUndefined()
  })

  it('distinguishes config 1 from nft_gate 1 in the same message shape', () => {
    expect(classifyPolicyAbort(modern(POLICY, 'config', 1))?.name).toBe('E_WRONG_VERSION')
    expect(classifyPolicyAbort(modern(POLICY, 'nft_gate', 1))?.name).toBe('E_ID_NOT_NAMESPACED')
  })
})

// The table mirrors the Move constants. When the policy package is checked out next to this repo, compare them.
const SOURCES = fileURLToPath(new URL('../../sealed-storage-sui/sources/', import.meta.url))
describe.skipIf(!existsSync(SOURCES))('policy abort map matches sealed-storage-sui', () => {
  for (const module of ['config', 'nft_gate', 'timelock', 'sealed_content'] as const) {
    it(`${module}: every error constant is in the table, and nothing else is`, () => {
      const source = readFileSync(`${SOURCES}${module}.move`, 'utf8')
      const fromMove = [...source.matchAll(/^const (E_[A-Z_]+): u64 = (\d+);/gm)].map((m) => `${m[1]}=${m[2]}`)
      const fromTable = POLICY_ABORTS.filter((a) => a.module === module).map((a) => `${a.name}=${a.code}`)
      expect(fromTable.sort()).toEqual(fromMove.sort())
    })
  }
})
