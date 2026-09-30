import { PolicyRegistry } from './registry.js'
import { createNftGateProvider } from './providers/nft-gate.js'
import { timeLockProvider } from './providers/timelock.js'

/**
 * A registry pre-loaded with the built-in providers (`nft-gate`, `time-lock`), registered as
 * peers in no particular priority. Consumers may `.register(...)` additional providers.
 *
 * @param accessGateOriginalId - The `access_gate` package's original id on the target network, to
 *   enable `suggest()` on the nft-gate provider. Omit (or pass `''`) for a registry with no chain
 *   suggestions.
 */
export function createDefaultRegistry(accessGateOriginalId = ''): PolicyRegistry {
  return new PolicyRegistry()
    .register(createNftGateProvider(accessGateOriginalId))
    .register(timeLockProvider)
}
