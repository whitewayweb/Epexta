import * as migration_20260907_175656 from './20260907_175656';
import * as migration_20260907_201107_add_api_keys from './20260907_201107_add_api_keys';
import * as migration_20260913_225113_add_module_entitlements from './20260913_225113_add_module_entitlements';
import * as migration_20260914_093002_google_connections from './20260914_093002_google_connections';
import * as migration_20260914_093210_google_site_hub_entitlements from './20260914_093210_google_site_hub_entitlements';
import * as migration_20260914_094627_google_site_hub_mappings from './20260914_094627_google_site_hub_mappings';

export const migrations = [
  {
    up: migration_20260907_175656.up,
    down: migration_20260907_175656.down,
    name: '20260907_175656',
  },
  {
    up: migration_20260907_201107_add_api_keys.up,
    down: migration_20260907_201107_add_api_keys.down,
    name: '20260907_201107_add_api_keys',
  },
  {
    up: migration_20260913_225113_add_module_entitlements.up,
    down: migration_20260913_225113_add_module_entitlements.down,
    name: '20260913_225113_add_module_entitlements',
  },
  {
    up: migration_20260914_093002_google_connections.up,
    down: migration_20260914_093002_google_connections.down,
    name: '20260914_093002_google_connections',
  },
  {
    up: migration_20260914_093210_google_site_hub_entitlements.up,
    down: migration_20260914_093210_google_site_hub_entitlements.down,
    name: '20260914_093210_google_site_hub_entitlements',
  },
  {
    up: migration_20260914_094627_google_site_hub_mappings.up,
    down: migration_20260914_094627_google_site_hub_mappings.down,
    name: '20260914_094627_google_site_hub_mappings'
  },
];
