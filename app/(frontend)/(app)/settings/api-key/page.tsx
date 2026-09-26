import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ApiKeysTable } from "@/components/settings/api-keys-table";
import { listApiKeys } from "@/lib/api-keys";
import { requireUser } from "@/lib/session";

const API_KEY_PATH = "/settings/api-key";

export default async function ApiKeySettingsPage() {
  const user = await requireUser(API_KEY_PATH);
  const keys = await listApiKeys(user.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="API keys"
        description={
          <>
            For scripts and MCP clients that take a static bearer token. Claude and ChatGPT don&apos;t need one: add
            Epexta from{" "}
            <Link href="/settings/connected-apps" className="font-medium text-foreground underline underline-offset-4">
              Connected apps
            </Link>{" "}
            instead.
          </>
        }
      />
      <ApiKeysTable initialKeys={keys} />
    </div>
  );
}
