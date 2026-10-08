import { ModuleNotEnabled } from "@/components/module-not-enabled";
import { PageHeader } from "@/components/page-header";
import { WordPressIcon } from "@/components/site/wordpress-icon";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { requireUser } from "@/lib/auth/session";

const SETTINGS_PATH = "/wordpress/settings";

export default async function WordPressSettingsPage() {
  const user = await requireUser(SETTINGS_PATH);

  const entitlement = await requireModuleEnabledForUser(user.id, "wordpress");
  if (!entitlement.ok && entitlement.reason === "not_enabled") {
    return <ModuleNotEnabled moduleName="WordPress" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="WordPress settings" description="Preferences for how Epexta works with your WordPress sites." />
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WordPressIcon />
          </EmptyMedia>
          <EmptyTitle>No settings yet</EmptyTitle>
          <EmptyDescription>WordPress settings will appear here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
