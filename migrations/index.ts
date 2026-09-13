import * as migration_20260907_175656 from './20260907_175656';
import * as migration_20260907_201107_add_api_keys from './20260907_201107_add_api_keys';
import * as migration_20260913_225113_add_module_entitlements from './20260913_225113_add_module_entitlements';

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
    name: '20260913_225113_add_module_entitlements'
  },
];
