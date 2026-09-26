import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  // shadcn's hook, kept exactly as installed: it reads the viewport in an effect so the first
  // client render matches the server's (a lazy useState initializer breaks hydration on phones).
  { files: ["hooks/use-mobile.ts"], rules: { "react-hooks/set-state-in-effect": "off" } },
];

export default config;
