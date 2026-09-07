import Link from "next/link";
import { LogoMark } from "@/components/site/logo-mark";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/auth-actions";
import { getCurrentUser } from "@/lib/session";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#tools", label: "Tools" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <LogoMark />
          epexta
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
              <Button variant="ghost" render={<Link href="/wordpress/connect" />}>
                Dashboard
              </Button>
              <form action={logoutAction}>
                <Button variant="outline" type="submit">
                  Log out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button variant="ghost" render={<Link href="/login" />}>
                Log in
              </Button>
              <Button render={<Link href="/signup" />}>Get started</Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
