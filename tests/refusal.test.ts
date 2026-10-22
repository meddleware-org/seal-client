import { describe, it, expect, vi } from 'vitest'

// The controller imports @mysten/seal; stub it so no key-server IO can happen (explainRefusal never uses it).
vi.mock('@mysten/seal', () => ({
  SealClient: class {
    constructor(_: unknown) {}
  },
  SessionKey: { create: vi.fn() },
  EncryptedObject: { parse: vi.fn() },
}))

import { Transaction } from '@mysten/sui/transactions'
import { POLICY_ABORTS } from '../src/aborts.js'
import { SealController } from '../src/controller.js'
import { REASON_NOT_OWNER, explainApproveRefusal, refusalMessage } from '../src/refusal.js'
import type { RefusalClient } from '../src/refusal.js'
import { PolicyRegistry } from '../src/registry.js'
import type { SealPolicyProvider } from '../src/types.js'

const ORIGINAL = '0x' + 'a1'.repeat(32)
const PUBLISHED = '0x' + 'b2'.repeat(32)
const OTHER_PKG = '0x' + 'c3'.repeat(32)
const SENDER = '0x' + 'd4'.repeat(32)

/** What a client returns for a simulated approve PTB that aborts, in the clients' structured shape. */
function abortResult(module: string, code: number, pkg = PUBLISHED) {
  return {
    $kind: 'FailedTransaction',
    FailedTransaction: {
      status: {
        success: false,
        error: {
          $kind: 'MoveAbort',
          message: `MoveAbort in 1st command, abort code: ${code}, in '${pkg}::${module}::seal_approve' (instruction 7)`,
          command: 0,
          MoveAbort: { abortCode: String(code), location: { package: pkg, module } },
        },
      },
    },
  }
}
const okResult = { $kind: 'Transaction', Transaction: { status: { success: true, error: null } } }

function fakeClient(answer: () => unknown | Promise<unknown>) {
  const simulateTransaction = vi.fn(async (_: unknown) => answer())
  const client: RefusalClient = { core: { simulateTransaction } }
  return { client, simulateTransaction }
}

function approveTx() {
  const tx = new Transaction()
  tx.moveCall({ target: `${PUBLISHED}::noop::seal_approve`, arguments: [tx.pure.vector('u8', [0])] })
  return tx
}
const explain = (client: RefusalClient) =>
  explainApproveRefusal(client, approveTx(), { sender: SENDER, policyPackageIds: [ORIGINAL, PUBLISHED] })

describe('explainApproveRefusal: every abort of the seal_policies table', () => {
  for (const abort of POLICY_ABORTS) {
    it(`${abort.module}::${abort.name} (${abort.code}) is refused with its name`, async () => {
      const { client } = fakeClient(() => abortResult(abort.module, abort.code))
      const r = await explain(client)
      expect(r).toMatchObject({ kind: 'refused', reason: abort.name, module: abort.module, code: abort.code, advice: abort.advice })
      expect(r.message.length).toBeGreaterThan(10)
      expect(r.message).toBe(refusalMessage(abort))
      expect(r.raw).toBeDefined()
    })

    it(`${abort.module}::${abort.name} is read from the message alone`, async () => {
      const text = `MoveAbort in 1st command, abort code: ${abort.code}, in '${ORIGINAL}::${abort.module}::seal_approve' (instruction 3)`
      const { client } = fakeClient(() => ({
        $kind: 'FailedTransaction',
        FailedTransaction: { status: { success: false, error: { message: text } } },
      }))
      expect(await explain(client)).toMatchObject({ kind: 'refused', reason: abort.name, module: abort.module, code: abort.code })
    })

    it(`${abort.module}::${abort.name} has its own UI text, not the generic fallback`, () => {
      expect(refusalMessage(abort)).not.toBe(abort.meaning)
    })
  }

  it('the same small code in different modules is told apart (code 1 is four different aborts)', async () => {
    const names = new Set<string>()
    for (const module of ['config', 'nft_gate', 'timelock', 'sealed_content']) {
      const r = await explain(fakeClient(() => abortResult(module, 1)).client)
      names.add(`${r.module}:${r.reason}`)
    }
    expect(names.size).toBe(4)
  })
})

describe('explainApproveRefusal: other outcomes', () => {
  it('allowed when the approve call succeeds', async () => {
    const { client } = fakeClient(() => okResult)
    const r = await explain(client)
    expect(r.kind).toBe('allowed')
    expect(r.reason).toBeUndefined()
    expect(r.message).toMatch(/key servers/)
  })

  it('simulates read-only, as the requester, and only once', async () => {
    const { client, simulateTransaction } = fakeClient(() => okResult)
    const tx = approveTx()
    await explainApproveRefusal(client, tx, { sender: SENDER })
    expect(simulateTransaction).toHaveBeenCalledTimes(1)
    const call = simulateTransaction.mock.calls[0]?.[0] as { transaction: Transaction }
    expect(call.transaction).toBe(tx)
    expect(tx.getData().sender).toBe(SENDER)
    // the fake exposes nothing but simulateTransaction: signing or executing would throw
    expect(Object.keys(client.core)).toEqual(['simulateTransaction'])
  })

  it('an abort of a package that is not the policy package is refused but not named', async () => {
    const { client } = fakeClient(() => abortResult('nft_gate', 4, OTHER_PKG))
    const r = await explain(client)
    expect(r).toMatchObject({ kind: 'refused', module: 'nft_gate', code: 4 })
    expect(r.reason).toBeUndefined()
    expect(r.advice).toBeUndefined()
    expect(r.message).toMatch(/abort 4 in nft_gate/)
    // without policyPackageIds the module name alone is trusted
    const unfiltered = await explainApproveRefusal(fakeClient(() => abortResult('nft_gate', 4, OTHER_PKG)).client, approveTx(), { sender: SENDER })
    expect(unfiltered.reason).toBe('E_GATE_PAUSED')
  })

  it('an abort code the table does not define is refused but not named', async () => {
    const r = await explain(fakeClient(() => abortResult('nft_gate', 99)).client)
    expect(r).toMatchObject({ kind: 'refused', module: 'nft_gate', code: 99 })
    expect(r.reason).toBeUndefined()
  })

  it('a code beyond the safe integer range is refused with the code left out', async () => {
    const big = abortResult('access_gate', 0)
    big.FailedTransaction.status.error.MoveAbort.abortCode = '9223372036854775808'
    big.FailedTransaction.status.error.message = 'x'
    const r2 = await explain(fakeClient(() => big).client)
    expect(r2.kind).toBe('refused')
    expect(r2.code).toBeUndefined()
  })

  it('a requester who does not own the pass: the simulation throws, and that is a refusal (NOT_OWNER)', async () => {
    const err = new Error(`Transaction was not signed by the correct sender: Object 0x1 is owned by account address ${SENDER}`)
    const r = await explain(fakeClient(() => Promise.reject(err)).client)
    expect(r).toMatchObject({ kind: 'refused', reason: REASON_NOT_OWNER })
    expect(r.module).toBeUndefined()
    expect(r.raw).toBe(err)
    // also when the text is only on the cause
    const wrapped = new Error('request failed', { cause: err })
    expect((await explain(fakeClient(() => Promise.reject(wrapped)).client)).reason).toBe(REASON_NOT_OWNER)
  })

  it('a network error is unknown with the cause, and does not throw', async () => {
    const err = new Error('fetch failed')
    const r = await explain(fakeClient(() => Promise.reject(err)).client)
    expect(r.kind).toBe('unknown')
    expect(r.cause).toBe(err)
    expect(r.message).toContain('fetch failed')
  })

  it('a non-Error rejection is unknown too', async () => {
    const r = await explain(fakeClient(() => Promise.reject('boom')).client)
    expect(r).toMatchObject({ kind: 'unknown', cause: 'boom' })
    expect(r.message).toContain('boom')
  })

  it('a failure that is not a Move abort is unknown (with the error as raw)', async () => {
    const { client } = fakeClient(() => ({
      $kind: 'FailedTransaction',
      FailedTransaction: { status: { success: false, error: { $kind: 'InsufficientGas', message: 'InsufficientGas' } } },
    }))
    const r = await explain(client)
    expect(r.kind).toBe('unknown')
    expect(r.raw).toMatchObject({ message: 'InsufficientGas' })
  })

  it('a failure with no error at all is unknown', async () => {
    const r = await explain(fakeClient(() => ({ $kind: 'FailedTransaction', FailedTransaction: { status: { success: false } } })).client)
    expect(r.kind).toBe('unknown')
  })

  const malformed: [string, unknown][] = [
    ['undefined', undefined],
    ['null', null],
    ['a string', 'ok'],
    ['an empty object', {}],
    ['a transaction without status', { $kind: 'Transaction', Transaction: {} }],
    ['a status without success', { Transaction: { status: {} } }],
    ['a non-boolean success', { Transaction: { status: { success: 'true' } } }],
    ['a failed transaction that is not an object', { FailedTransaction: 3 }],
    ['an abort with a non-numeric code', { FailedTransaction: { status: { success: false, error: { MoveAbort: { abortCode: 'x' } } } } }],
  ]
  for (const [label, value] of malformed) {
    it(`never throws on malformed simulation result: ${label}`, async () => {
      const r = await explain(fakeClient(() => value).client)
      expect(r.kind).toBe('unknown')
      expect(r.message.length).toBeGreaterThan(0)
    })
  }
})

describe('SealController.explainRefusal', () => {
  const provider: SealPolicyProvider = {
    type: 'noop',
    buildId: () => new Uint8Array([0]),
    verifyId: () => {},
    buildApprove: (tx, target, idBytes) => {
      tx.moveCall({ target: `${target.publishedAt}::noop::seal_approve`, arguments: [tx.pure.vector('u8', Array.from(idBytes))] })
    },
    describe: () => ({ type: 'noop', label: '', help: '', encryptFields: [], decryptFields: [] }),
  }
  const badProvider: SealPolicyProvider = {
    ...provider,
    type: 'bad',
    buildApprove: (tx) => {
      tx.moveCall({ target: '0x2::coin::zero', typeArguments: ['0x2::sui::SUI'], arguments: [] })
    },
  }
  const throwingProvider: SealPolicyProvider = {
    ...provider,
    type: 'throws',
    buildApprove: () => {
      throw new Error('bad params')
    },
  }

  function controller(client: RefusalClient) {
    const registry = new PolicyRegistry().register(provider).register(badProvider).register(throwingProvider)
    return new SealController(
      { suiClient: client as never, originalId: ORIGINAL, publishedAt: PUBLISHED, policyConfigId: '0x7', serverConfigs: [{ objectId: '0xs' }], threshold: 1 },
      registry,
    )
  }

  it('simulates the approve PTB the decrypt would send, as the requester, and names the abort', async () => {
    const { client, simulateTransaction } = fakeClient(() => abortResult('nft_gate', 4))
    const r = await controller(client).explainRefusal('noop', {}, '0a0b', { address: SENDER })
    expect(r).toMatchObject({ kind: 'refused', reason: 'E_GATE_PAUSED', module: 'nft_gate', code: 4 })
    const tx = (simulateTransaction.mock.calls[0]?.[0] as { transaction: Transaction }).transaction
    expect(tx.getData().sender).toBe(SENDER)
    const call = tx.getData().commands[0]
    expect(call?.$kind === 'MoveCall' && call.MoveCall.function).toBe('seal_approve')
  })

  it('names an abort from the original id as well as from the published-at', async () => {
    const r = await controller(fakeClient(() => abortResult('timelock', 2, ORIGINAL)).client).explainRefusal('noop', {}, '00', { address: SENDER })
    expect(r.reason).toBe('E_TOO_EARLY')
  })

  it('does not name an abort of a foreign package', async () => {
    const r = await controller(fakeClient(() => abortResult('timelock', 2, OTHER_PKG)).client).explainRefusal('noop', {}, '00', { address: SENDER })
    expect(r).toMatchObject({ kind: 'refused', module: 'timelock', code: 2 })
    expect(r.reason).toBeUndefined()
  })

  it('allowed', async () => {
    expect((await controller(fakeClient(() => okResult).client).explainRefusal('noop', {}, '00', { address: SENDER })).kind).toBe('allowed')
  })

  it('network error: unknown with the cause', async () => {
    const err = new Error('503')
    const r = await controller(fakeClient(() => Promise.reject(err)).client).explainRefusal('noop', {}, '00', { address: SENDER })
    expect(r).toMatchObject({ kind: 'unknown', cause: err })
  })

  it('a provider that builds something other than seal_approve calls is unknown, and nothing is simulated', async () => {
    const { client, simulateTransaction } = fakeClient(() => okResult)
    const r = await controller(client).explainRefusal('bad', {}, '00', { address: SENDER })
    expect(r.kind).toBe('unknown')
    expect(r.cause).toBeInstanceOf(Error)
    expect(simulateTransaction).not.toHaveBeenCalled()
  })

  it('a provider that throws while building, and a malformed id, are unknown (not thrown)', async () => {
    const { client, simulateTransaction } = fakeClient(() => okResult)
    const c = controller(client)
    expect(await c.explainRefusal('throws', {}, '00', { address: SENDER })).toMatchObject({ kind: 'unknown' })
    expect(await c.explainRefusal('noop', {}, 'zz', { address: SENDER })).toMatchObject({ kind: 'unknown' })
    expect(simulateTransaction).not.toHaveBeenCalled()
  })

  it('an unregistered policy type throws, as decrypt does', async () => {
    await expect(controller(fakeClient(() => okResult).client).explainRefusal('nope', {}, '00', { address: SENDER })).rejects.toThrow()
  })
})
