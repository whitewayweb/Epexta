import Link from "next/link";
import { LogoMark } from "@/components/site/logo-mark";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 font-medium text-foreground">
          <LogoMark className="w-4" />
          epexta
        </div>
        <p>From a thought to a draft, ready for the world.</p>
        <div className="flex items-center gap-4">
          <Link href="/signup" className="transition-colors hover:text-foreground">
            Get started
          </Link>
          <Link href="/login" className="transition-colors hover:text-foreground">
            Log in
          </Link>
        </div>
      </div>
    </footer>
  );
}
