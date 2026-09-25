import * as migration_20260907_175656 from './20260907_175656';
import * as migration_20260907_201107_add_api_keys from './20260907_201107_add_api_keys';
import * as migration_20260913_225113_add_module_entitlements from './20260913_225113_add_module_entitlements';
import * as migration_20260914_093002_google_connections from './20260914_093002_google_connections';
import * as migration_20260914_093210_google_site_hub_entitlements from './20260914_093210_google_site_hub_entitlements';
import * as migration_20260914_094627_google_site_hub_mappings from './20260914_094627_google_site_hub_mappings';
import * as migration_20260914_095814_cascade_delete_fks from './20260914_095814_cascade_delete_fks';
import * as migration_20260914_105016_google_site_hub_reporting from './20260914_105016_google_site_hub_reporting';
import * as migration_20260914_120000_cascade_delete_reporting_fks from './20260914_120000_cascade_delete_reporting_fks';
import * as migration_20260914_223935_add_site_performance_report_type from './20260914_223935_add_site_performance_report_type';
import * as migration_20260914_224504_remove_compare_periods_report_type from './20260914_224504_remove_compare_periods_report_type';
import * as migration_20260915_181406_add_wordpress_seo_provider_fields from './20260915_181406_add_wordpress_seo_provider_fields';
import * as migration_20260925_163833_add_oauth_authorization_server from './20260925_163833_add_oauth_authorization_server';
import * as migration_20260925_221212_oauth_grant_revoked_by from './20260925_221212_oauth_grant_revoked_by';

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
    name: '20260914_094627_google_site_hub_mappings',
  },
  {
    up: migration_20260914_095814_cascade_delete_fks.up,
    down: migration_20260914_095814_cascade_delete_fks.down,
    name: '20260914_095814_cascade_delete_fks',
  },
  {
    up: migration_20260914_105016_google_site_hub_reporting.up,
    down: migration_20260914_105016_google_site_hub_reporting.down,
    name: '20260914_105016_google_site_hub_reporting',
  },
  {
    up: migration_20260914_120000_cascade_delete_reporting_fks.up,
    down: migration_20260914_120000_cascade_delete_reporting_fks.down,
    name: '20260914_120000_cascade_delete_reporting_fks',
  },
  {
    up: migration_20260914_223935_add_site_performance_report_type.up,
    down: migration_20260914_223935_add_site_performance_report_type.down,
    name: '20260914_223935_add_site_performance_report_type',
  },
  {
    up: migration_20260914_224504_remove_compare_periods_report_type.up,
    down: migration_20260914_224504_remove_compare_periods_report_type.down,
    name: '20260914_224504_remove_compare_periods_report_type',
  },
  {
    up: migration_20260915_181406_add_wordpress_seo_provider_fields.up,
    down: migration_20260915_181406_add_wordpress_seo_provider_fields.down,
    name: '20260915_181406_add_wordpress_seo_provider_fields',
  },
  {
    up: migration_20260925_163833_add_oauth_authorization_server.up,
    down: migration_20260925_163833_add_oauth_authorization_server.down,
    name: '20260925_163833_add_oauth_authorization_server',
  },
  {
    up: migration_20260925_221212_oauth_grant_revoked_by.up,
    down: migration_20260925_221212_oauth_grant_revoked_by.down,
    name: '20260925_221212_oauth_grant_revoked_by'
  },
];
