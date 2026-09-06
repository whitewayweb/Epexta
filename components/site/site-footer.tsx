import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
            E
          </span>
          Epexta
        </div>
        <p>Connect ChatGPT and Claude to WordPress — one organisation at a time.</p>
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
