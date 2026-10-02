import type React from "react";
import { ModuleNav } from "@/modules/wordpress/ModuleNav";

export default function WordPressLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-8">
      <ModuleNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
