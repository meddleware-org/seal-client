import { PolicyRegistry } from './registry.js'
import { createNftGateProvider } from './providers/nft-gate.js'
import { timeLockProvider } from './providers/timelock.js'

/**
 * A registry pre-loaded with the built-in providers (`nft-gate`, `time-lock`), registered as
 * peers in no particular priority. Consumers may `.register(...)` additional providers.
 *
 * @param accessGatePackageId - The deployed `access_gate` package ID for the target network.
 *   Pass the network-specific package ID to enable `suggest()` on the nft-gate provider.
 *   Omit (or pass `''`) to get a zero-config registry with no chain-suggestion capability.
 */
export function createDefaultRegistry(accessGatePackageId = ''): PolicyRegistry {
  return new PolicyRegistry()
    .register(createNftGateProvider(accessGatePackageId))
    .register(timeLockProvider)
}
