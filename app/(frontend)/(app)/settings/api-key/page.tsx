import { ApiKeysTable } from "@/components/settings/api-keys-table";
import { Card, CardContent } from "@/components/ui/card";
import { listApiKeys } from "@/lib/api-keys";
import { requireUser } from "@/lib/session";

const API_KEY_PATH = "/settings/api-key";

export default async function ApiKeySettingsPage() {
  const user = await requireUser(API_KEY_PATH);
  const keys = await listApiKeys(user.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>

      <Card>
        <CardContent>
          <ApiKeysTable initialKeys={keys} />
        </CardContent>
      </Card>
    </div>
  );
}
