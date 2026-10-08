import type { SealPolicyProvider } from './types.js'

/**
 * A registry of Seal policy providers. Neither ordering nor identity is privileged — the
 * consuming UI iterates `list()` to render its policy picker, so registering a new provider is
 * the only change needed to expose a new policy type.
 */
export class PolicyRegistry {
  private readonly providers = new Map<string, SealPolicyProvider<never>>()

  /**
   * Register a provider. Returns `this` for chaining.
   *
   * A second provider for a type that is already registered is refused: replacing the built-in `nft-gate`
   * would silently change how identities are built. Pass `{ replace: true }` when that is the intent.
   */
  register<P>(provider: SealPolicyProvider<P>, options: { replace?: boolean } = {}): this {
    if (this.providers.has(provider.type) && !options.replace) {
      throw new Error(
        `A Seal policy provider for "${provider.type}" is already registered; pass { replace: true } to replace it.`,
      )
    }
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
