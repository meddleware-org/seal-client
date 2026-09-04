import type { SealPolicyProvider } from './types.js'

/**
 * A registry of Seal policy providers. Neither ordering nor identity is privileged — the
 * consuming UI iterates `list()` to render its policy picker, so registering a new provider is
 * the only change needed to expose a new policy type.
 */
export class PolicyRegistry {
  private readonly providers = new Map<string, SealPolicyProvider<never>>()

  /** Register (or replace) a provider. Returns `this` for chaining. */
  register<P>(provider: SealPolicyProvider<P>): this {
    this.providers.set(provider.type, provider as SealPolicyProvider<never>)
    return this
  }

  /** Look up a provider by type, throwing a clear error if it is not registered. */
  get<P = Record<string, unknown>>(type: string): SealPolicyProvider<P> {
    const provider = this.providers.get(type)
    if (!provider) {
      const known = [...this.providers.keys()].join(', ') || '(none)'
      throw new Error(`Unknown Seal policy type "${type}". Registered: ${known}.`)
    }
    return provider as unknown as SealPolicyProvider<P>
  }

  /** True if a provider is registered for `type`. */
  has(type: string): boolean {
    return this.providers.has(type)
  }

  /** All registered providers, in insertion order. */
  list(): SealPolicyProvider<never>[] {
    return [...this.providers.values()]
  }
}
