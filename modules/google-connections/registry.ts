import type { GoogleCapability } from "./capabilities";

// Lets a mapping-owning module (google-search-console, google-analytics) tell
// modules/google-connections/ "does anything in my own mapping collection reference
// this connection?" and "mark my mappings referencing this connection needs_reconnect"
// without google-connections ever querying another module's collection schema
// directly - see "Connection lifecycle" in GOOGLE_PERFORMANCE_PLAN.md. Each module
// calls registerConnectionLifecycleHooks(capability, ...) once, from its own
// payload.config.ts collection registration module, at import time.
export interface ConnectionLifecycleHooks {
  /** True if any mapping (active or superseded) in this module still references connectionId. */
  isConnectionReferenced: (connectionId: string) => Promise<boolean>;
  /** Marks every mapping referencing connectionId as needs_reconnect. */
  markMappingsNeedingReconnect: (connectionId: string) => Promise<void>;
  /**
   * True if any mapping (active or superseded) in this module still references the
   * given WordPress connection id. Lets modules/wordpress/organisation.ts ask "would
   * deleting this WordPress connection orphan Google mapping history?" without
   * importing either mapping collection's schema directly - the same cross-module
   * decoupling isConnectionReferenced already provides for Google connections.
   */
  isWordPressConnectionReferenced: (wordpressConnectionId: string) => Promise<boolean>;
}

const registry = new Map<GoogleCapability, ConnectionLifecycleHooks>();

export function registerConnectionLifecycleHooks(capability: GoogleCapability, hooks: ConnectionLifecycleHooks): void {
  registry.set(capability, hooks);
}

export function getConnectionLifecycleHooks(capability: GoogleCapability): ConnectionLifecycleHooks | undefined {
  return registry.get(capability);
}

/**
 * Which registered capabilities (google-search-console, google-analytics, ...) still
 * have a mapping - active or superseded - pointing at this WordPress connection.
 * Empty means deleting the connection is safe; a non-empty result means the caller
 * should block or otherwise handle the deletion instead of letting Postgres's
 * ON DELETE CASCADE (see migrations/20260914_095814_cascade_delete_fks.ts) silently
 * wipe that mapping history.
 */
export async function referencingCapabilitiesForWordPressConnection(
  wordpressConnectionId: string
): Promise<GoogleCapability[]> {
  const entries = Array.from(registry.entries());
  const results = await Promise.all(
    entries.map(async ([capability, hooks]) => {
      const referenced = await hooks.isWordPressConnectionReferenced(wordpressConnectionId);
      return referenced ? capability : null;
    })
  );
  return results.filter((capability): capability is GoogleCapability => capability !== null);
}
