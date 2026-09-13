import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown in place of a module's normal page content when
 * requireModuleEnabledForUser resolves { ok: false, reason: "not_enabled" }.
 * Not a 404 - the org exists, the module just isn't in its plan.
 */
export function ModuleNotEnabled({ moduleName }: { moduleName: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {moduleName} isn&apos;t included in your organisation&apos;s plan. Contact us to enable it.
      </CardContent>
    </Card>
  );
}
