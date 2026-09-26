import { Lock } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/**
 * Shown in place of a module's normal page content when
 * requireModuleEnabledForUser resolves { ok: false, reason: "not_enabled" }.
 * Not a 404 - the org exists, the module just isn't in its plan.
 */
export function ModuleNotEnabled({ moduleName }: { moduleName: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Lock />
        </EmptyMedia>
        <EmptyTitle>{moduleName} isn&apos;t on your plan</EmptyTitle>
        <EmptyDescription>Contact us to add it to your organisation.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
