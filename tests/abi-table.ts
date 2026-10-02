// Every transaction builder and every policy provider's `buildApprove`, called with placeholder ids,
// and the Move calls they produce. Shared by the offline completeness test and the testnet
// ABI-drift check (tests/integration/abi-drift).
import { Transaction } from '@mysten/sui/transactions'
import * as client from '../src/index.js'

export const PKG = '0x' + 'a1'.repeat(32)
const id = (n: number) => '0x' + n.toString(16).padStart(64, '0')
const target = { publishedAt: PKG, policyConfigId: id(1) }
const content = { gateId: id(2), blobId: 'blob', sealId: 'ab', label: 'l' }
const idBytes = new Uint8Array(48)

function approve(type: string, params: Record<string, unknown>): Transaction {
  const tx = new Transaction()
  client.createDefaultRegistry().get(type).buildApprove(tx, target, idBytes, params)
  return tx
}

/** Exported builder name → transactions it builds. */
export const BUILDERS: Record<string, () => Transaction[]> = {
  buildPublishSealedContentTransaction: () => [client.buildPublishSealedContentTransaction(target, content)],
  buildPublishSealedContentTx: () => {
    const tx = new Transaction()
    client.buildPublishSealedContentTx(tx, target, content)
    return [tx]
  },
}

/** Policy provider type → `seal_approve*` transactions (one per Move function it can choose). */
export const PROVIDERS: Record<string, () => Transaction[]> = {
  'nft-gate': () => [
    approve('nft-gate', { gateId: id(2), nftId: id(3) }),
    approve('nft-gate', { gateId: id(2), nftId: id(3), soulbound: true }),
  ],
  'time-lock': () => [approve('time-lock', {})],
}

export interface MoveCallShape {
  package: string
  module: string
  function: string
  typeArguments: number
  arguments: number
}

/** The Move calls in `tx`, as target + arity. */
export function moveCalls(tx: Transaction): MoveCallShape[] {
  return tx.getData().commands.flatMap((c) =>
    c.$kind === 'MoveCall'
      ? [{
          package: c.MoveCall.package,
          module: c.MoveCall.module,
          function: c.MoveCall.function,
          typeArguments: c.MoveCall.typeArguments.length,
          arguments: c.MoveCall.arguments.length,
        }]
      : [],
  )
}

/** Every distinct Move call the builders and providers make. */
export function allMoveCalls(): MoveCallShape[] {
  const seen = new Map<string, MoveCallShape>()
  for (const build of [...Object.values(BUILDERS), ...Object.values(PROVIDERS)]) {
    for (const tx of build()) {
      for (const call of moveCalls(tx)) seen.set(`${call.package}::${call.module}::${call.function}`, call)
    }
  }
  return [...seen.values()]
}

/** Exported builder names (`build…Tx` / `build…Transaction`). */
export const exportedBuilders = Object.keys(client).filter((k) => /^build\w*(Tx|Transaction)$/.test(k)).sort()

/** Policy types the default registry ships. */
export const registeredPolicies = client.createDefaultRegistry().list().map((p) => p.type).sort()
