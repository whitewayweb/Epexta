import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy · Epexta",
  description: "What data Epexta collects, how it is protected, and how the hosted LinkedIn sign-in service handles tokens.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what Epexta (operated by White Way Web) collects and how it is used. We collect only what is
        needed to run the service.
      </p>

      <h2>Account data</h2>
      <p>
        Your name, email address, and a hashed password (never the password itself), plus the organisation you belong to
        and your role in it.
      </p>

      <h2>Connections you add</h2>
      <p>
        For WordPress connections: the site URL, username, and Application Password. Application Passwords are
        encrypted at rest. API keys and OAuth tokens issued by Epexta are stored only as one-way hashes.
      </p>

      <h2>LinkedIn sign-in service</h2>
      <ul>
        <li>
          When a WordPress plugin sends you to Epexta to connect LinkedIn, we exchange LinkedIn&apos;s authorisation code
          for an access token using our LinkedIn app credentials, and pass that token once to the website you approved.
        </li>
        <li>
          <strong>We do not store the LinkedIn access token, your LinkedIn profile, or your posts.</strong> The
          short-lived state and hand-off values are encrypted, expire within minutes, and are not kept in a database.
        </li>
        <li>
          The token can only be redeemed by the website origin you approved. Posting to LinkedIn happens directly from
          your website, not through Epexta.
        </li>
      </ul>

      <h2>Technical data</h2>
      <p>
        We use Vercel for hosting and privacy-friendly usage analytics. Standard server logs (such as IP address and
        request time) may be kept for security and troubleshooting.
      </p>

      <h2>Sharing</h2>
      <p>
        We do not sell your data. It is shared only with the providers needed to run Epexta (hosting and database) and
        with the services you choose to connect.
      </p>

      <h2>Retention and your rights</h2>
      <p>
        We keep account data while your account exists. You can disconnect a site, revoke a connected app, or ask us to
        delete your account and data, and you may ask for a copy of your data or a correction to it.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions: <a href="https://whitewayweb.com">whitewayweb.com</a>. See also our{" "}
        <a href="/terms">Terms of Service</a>.
      </p>
    </LegalPage>
  );
}
