import Link from "next/link";
import { MODULES } from "@/lib/modules";

export default function HomePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>WP ChatGPT Publisher</h1>
      <p>Connect one of the integrations below, then add its MCP URL as a custom connector in ChatGPT.</p>
      <ul>
        {MODULES.map((mod) => (
          <li key={mod.slug} style={{ marginBottom: 12 }}>
            <strong>{mod.name}</strong> — {mod.description}
            <br />
            <Link href={mod.connectPath}>Connect</Link>
            {" · "}
            <code>{mod.mcpPath}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
