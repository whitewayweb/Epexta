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
}

const registry = new Map<GoogleCapability, ConnectionLifecycleHooks>();

export function registerConnectionLifecycleHooks(capability: GoogleCapability, hooks: ConnectionLifecycleHooks): void {
  registry.set(capability, hooks);
}

export function getConnectionLifecycleHooks(capability: GoogleCapability): ConnectionLifecycleHooks | undefined {
  return registry.get(capability);
}
