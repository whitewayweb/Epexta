import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { MODULES } from "@/lib/modules";
import {
  Boxes,
  FileEdit,
  FolderTree,
  ImagePlus,
  KeyRound,
  Lock,
  Rocket,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";

const CLIENTS = ["Claude", "ChatGPT", "Claude Code", "Cursor"];

const STEPS = [
  {
    title: "Create your account",
    description: "Sign up with an email and password — no credit card required to get started.",
  },
  {
    title: "Connect your WordPress site",
    description:
      "Add your site URL and a WordPress Application Password. It's encrypted at rest the moment you save it.",
  },
  {
    title: "Add the MCP URL to your AI client",
    description:
      "Paste your organisation's connector URL into Claude, ChatGPT, or Cursor and start publishing from chat.",
  },
];

const TOOLS = [
  {
    icon: FileEdit,
    name: "create_post / update_post",
    description: "Draft, edit, and refine blog posts — content, slug, SEO title and description included.",
  },
  {
    icon: Rocket,
    name: "publish_post",
    description: "Flip a draft live once you've reviewed it. Every post starts as a draft by default.",
  },
  {
    icon: ImagePlus,
    name: "set_featured_image",
    description: "Upload an image by URL or base64 and set it as a post's featured image in one call.",
  },
  {
    icon: FolderTree,
    name: "list_categories",
    description: "Read existing categories so the AI can resolve or create the right taxonomy terms.",
  },
  {
    icon: Tags,
    name: "list_tags",
    description: "Read existing tags — resolved or created by name when a post needs them.",
  },
  {
    icon: Boxes,
    name: "list_posts",
    description: "Read what's already on the site before writing something new.",
  },
];

const SECURITY_POINTS = [
  "WordPress Application Passwords for authentication — your real password is never stored.",
  "Credentials encrypted at rest with AES-256-GCM before they ever touch the database.",
  "No delete tools. Posts, media, categories, and tags can be created and edited, never destroyed.",
  "Posts default to draft — the AI cannot publish without a status change you control.",
  "Organisation-scoped API keys — each member's key only reaches their own organisation's site.",
  "Members can use the connection without ever seeing the underlying Application Password.",
];

const ROLES = [
  {
    icon: ShieldCheck,
    title: "Superadmin",
    description: "Platform owner. The only role with access to the admin panel — not a customer-facing role.",
  },
  {
    icon: KeyRound,
    title: "Organisation admin",
    description: "Connects the WordPress site, invites teammates, and generates their own API key.",
  },
  {
    icon: Users,
    title: "Organisation member",
    description: "Gets an API key to use the connected site's MCP tools — no access to the credentials themselves.",
  },
];

const FAQS = [
  {
    question: "Which AI clients does this work with?",
    answer:
      "Any MCP-compatible client — Claude, Claude Code, ChatGPT, and Cursor all work out of the box. Add your organisation's connector URL and go.",
  },
  {
    question: "Do I need to install a WordPress plugin?",
    answer:
      "No plugin required. Epexta talks to your site through the standard WordPress REST API using an Application Password you generate from wp-admin.",
  },
  {
    question: "Can the AI delete anything on my site?",
    answer:
      "No. Delete operations are intentionally left out of every tool — for posts, media, categories, and tags — to keep the blast radius limited to creating and editing content.",
  },
  {
    question: "How are my WordPress credentials protected?",
    answer:
      "Application Passwords are encrypted at rest with AES-256-GCM the moment you save a connection, and only decrypted server-side when a tool call needs them.",
  },
  {
    question: "Can my whole team use one WordPress connection?",
    answer:
      "Yes. An organisation admin connects the site once; every organisation member gets their own API key to use the same connection without ever seeing the credentials.",
  },
];

export default function HomePage() {
  const wordpress = MODULES[0];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center md:py-28">
            <div>
              <Badge variant="secondary" className="mb-6">
                MCP server for WordPress
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Your AI just learned WordPress.
              </h1>
              <p className="mt-6 max-w-lg text-lg text-muted-foreground text-pretty">
                Connect your self-hosted WordPress site to the Claude or ChatGPT you already use.
                Write, categorize, illustrate, and publish posts — in plain English, with no delete
                tools and no plaintext credentials.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" render={<Link href="/signup" />}>
                  Get started free
                </Button>
                <Button size="lg" variant="outline" render={<a href="#how-it-works" />}>
                  See how it works
                </Button>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                Free to start · No credit card · Works with your existing AI subscription
              </p>
            </div>

            <Card className="border-border/60 bg-card/60 py-0 shadow-lg">
              <CardContent className="space-y-3 p-5 font-mono text-xs sm:text-sm">
                <div className="flex items-center gap-1.5 pb-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                  <span className="ml-2 text-muted-foreground">claude.ai / epexta</span>
                </div>
                <div>
                  <p className="text-muted-foreground">Prompt</p>
                  <p className="text-foreground">
                    Write a post about our autumn sale, add a hero image, and save it as a draft.
                  </p>
                </div>
                <div>
                  <p className="text-primary">create_post</p>
                  <p className="text-muted-foreground">
                    → draft &quot;Autumn Sale Starts Now&quot; created with SEO title &amp; description
                  </p>
                </div>
                <div>
                  <p className="text-primary">set_featured_image</p>
                  <p className="text-muted-foreground">→ autumn-sale-hero.jpg attached to post</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Result</p>
                  <p className="text-foreground">
                    Draft ready for review — nothing published without your go-ahead.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Client logos */}
        <section className="border-b border-border/60 py-10">
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-center text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Works with any MCP client
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-medium text-muted-foreground/80 sm:text-base">
              {CLIENTS.map((client) => (
                <span key={client}>{client}</span>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-b border-border/60 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">
                Connect Claude or ChatGPT in three steps
              </h2>
              <p className="mt-3 text-muted-foreground">
                No plugin to install on WordPress — just an Application Password and a connector URL.
              </p>
            </div>
            <div className="mt-14 grid gap-8 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <div key={step.title} className="relative">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </div>
                  <h3 className="text-lg font-medium">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-12 flex justify-center">
              <Button render={<Link href={wordpress.connectPath} />}>
                Connect {wordpress.name}
              </Button>
            </div>
          </div>
        </section>

        {/* Tools */}
        <section id="tools" className="border-b border-border/60 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">A focused WordPress toolkit</h2>
              <p className="mt-3 text-muted-foreground">
                {wordpress.description} Every tool talks to the standard WordPress REST API — no
                custom plugin required.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {TOOLS.map((tool) => (
                <Card key={tool.name} className="border-border/60">
                  <CardHeader>
                    <tool.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                    <CardTitle className="pt-2 font-mono text-sm">{tool.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {tool.description}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="border-b border-border/60 bg-muted/30 py-20">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2">
            <div>
              <Badge variant="secondary" className="mb-4">
                <Lock className="h-3.5 w-3.5" />
                Safe by default
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight">
                Write access to a live site needs real guardrails.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Every module is built to keep its blast radius small — creating and editing content,
                never destroying it.
              </p>
            </div>
            <ul className="space-y-4">
              {SECURITY_POINTS.map((point) => (
                <li key={point} className="flex gap-3 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-foreground/90">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Roles */}
        <section className="border-b border-border/60 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">Built for teams, not just one login</h2>
              <p className="mt-3 text-muted-foreground">
                One organisation, one WordPress connection, and API keys scoped to each teammate.
              </p>
            </div>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {ROLES.map((role) => (
                <Card key={role.title} className="border-border/60">
                  <CardHeader>
                    <role.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                    <CardTitle className="pt-2">{role.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {role.description}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-b border-border/60 py-20">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight">
              Frequently asked questions
            </h2>
            <Accordion className="mt-10">
              {FAQS.map((faq) => (
                <AccordionItem key={faq.question} value={faq.question}>
                  <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Give your AI access to WordPress.</h2>
            <p className="mt-3 text-muted-foreground">Free to start. No credit card required.</p>
            <div className="mt-8 flex justify-center gap-3">
              <Button size="lg" render={<Link href="/signup" />}>
                Get started free
              </Button>
              <Button size="lg" variant="outline" render={<Link href="/login" />}>
                Log in
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
