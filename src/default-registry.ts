import { PolicyRegistry } from './registry.js'
import { nftGateProvider } from './providers/nft-gate.js'
import { timeLockProvider } from './providers/timelock.js'

/**
 * A registry pre-loaded with the built-in providers (`nft-gate`, `time-lock`), registered as
 * peers in no particular priority. Consumers may `.register(...)` additional providers.
 */
export function createDefaultRegistry(): PolicyRegistry {
  return new PolicyRegistry().register(nftGateProvider).register(timeLockProvider)
}
