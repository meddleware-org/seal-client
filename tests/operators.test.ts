import { describe, it, expect, vi } from 'vitest'
import { bcs } from '@mysten/sui/bcs'
import type { CoreEventEntry, SuiObjectClient } from '@meddleware/access-gate-client'
import { gateOperators } from '../src/operators.js'
import { listSealedContent, type SealEventsClient } from '../src/sealed-content.js'

const LINKED = '0x' + 'a5'.repeat(32)
const LOOKALIKE = '0x' + 'b6'.repeat(32)
const GATE = '0x' + '0a'.repeat(32)
const RECIPIENT = '0x' + '0d'.repeat(32)
const ROGUE = '0x' + 'ba'.repeat(32)
const PKG = '0x' + '42'.repeat(32)

const gateJson = (recipient: string) => ({
  price_mist: '1000',
  payment_recipient: recipient,
  default_uses: '0',
  soulbound: true,
  auto_burn_at_zero: false,
  paused: false,
  frozen: false,
  nft_name: 'Pass',
  nft_image_url: 'https://i.example/p.png',
  nft_description: 'A pass',
  free_fee_paid: false,
  policy: {
    freeze_requires_unpaused: true,
    lock_commission_on_freeze: false,
    pause_blocks_decryption: true,
    pause_blocks_access: true,
  },
  locked_commission: null,
})

function client(type: string | undefined, json: unknown = gateJson(RECIPIENT)) {
  const getObject = vi.fn(async () => ({ object: { objectId: GATE, type, json } }))
  return { getObject, client: { core: { getObject } } as unknown as SuiObjectClient }
}

describe('gateOperators (the default discovery safety, F6/F25)', () => {
  it("returns the gate's payment_recipient, reading the gate at the linked package", async () => {
    const { client: c, getObject } = client(`${LINKED}::access_gate::Gate`)
    expect(await gateOperators(c, GATE, LINKED)).toEqual([RECIPIENT])
    expect(getObject).toHaveBeenCalledWith(expect.objectContaining({ objectId: GATE }))
  })

  it('merges extra addresses, normalised, without duplicates, recipient first', async () => {
    const { client: c } = client(`${LINKED}::access_gate::Gate`)
    const wallet = '0x' + '0e'.repeat(32)
    const out = await gateOperators(c, GATE, LINKED, ['0xD', wallet.toUpperCase().replace('0X', '0x'), RECIPIENT, '0xd', wallet])
    expect(out).toEqual([RECIPIENT, '0x' + '0'.repeat(63) + 'd', wallet])
  })

  it('normalises a short payment_recipient', async () => {
    const { client: c } = client(`${LINKED}::access_gate::Gate`, gateJson('0xAB'))
    expect(await gateOperators(c, GATE, LINKED)).toEqual(['0x' + '0'.repeat(62) + 'ab'])
  })

  it('throws for a look-alike package, another type, an untyped object, or malformed fields', async () => {
    for (const type of [`${LOOKALIKE}::access_gate::Gate`, `${LINKED}::access_gate::AdminCap`, `${LINKED}::other::Gate`, undefined]) {
      await expect(gateOperators(client(type).client, GATE, LINKED)).rejects.toThrow(/is not a Gate of/)
    }
    await expect(
      gateOperators(client(`${LINKED}::access_gate::Gate`, { ...gateJson(RECIPIENT), payment_recipient: 7 }).client, GATE, LINKED),
    ).rejects.toThrow(/is not a Gate of/)
  })

  it('propagates a missing object', async () => {
    const c = { core: { getObject: vi.fn(async () => { throw new Error('Object not found') }) } } as unknown as SuiObjectClient
    await expect(gateOperators(c, GATE, LINKED)).rejects.toThrow(/not found/)
  })

  it('as listSealedContent publishers it keeps the operator and drops a rogue publisher', async () => {
    const Published = bcs.struct('SealedContentPublished', {
      content_id: bcs.Address, gate_id: bcs.Address, blob_id: bcs.string(), seal_id: bcs.string(), label: bcs.string(), publisher: bcs.Address,
    })
    const row = (label: string, publisher: string, i: number): CoreEventEntry => ({
      eventType: `${PKG}::sealed_content::SealedContentPublished`,
      sender: '0x1',
      bcs: Published.serialize({ content_id: '0x' + '0c'.repeat(32), gate_id: GATE, blob_id: 'blob', seal_id: 'seal', label, publisher }).toBytes(),
      checkpoint: '7',
      transactionDigest: `tx${i}`,
      eventIndex: 0,
    })
    const events = { core: { listEvents: vi.fn(async () => ({ events: [row('rogue', ROGUE, 1), row('real', RECIPIENT, 2)], hasNextPage: false, endCursor: null })) } } satisfies SealEventsClient
    const publishers = await gateOperators(client(`${LINKED}::access_gate::Gate`).client, GATE, LINKED)
    const page = await listSealedContent(events, { originalId: PKG, gateId: GATE, publishers })
    expect(page.pointers.map((p) => p.label)).toEqual(['real'])
  })
})
