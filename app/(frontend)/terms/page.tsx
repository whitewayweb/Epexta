import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service · Epexta",
  description: "The terms for using Epexta, including its hosted LinkedIn sign-in service for WordPress plugins.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        Epexta is operated by White Way Web (&quot;we&quot;, &quot;us&quot;). By creating an account or using Epexta you
        agree to these terms.
      </p>

      <h2>What Epexta provides</h2>
      <ul>
        <li>
          <strong>MCP connectors</strong> that let AI assistants such as Claude and ChatGPT work with sites and accounts
          you connect (for example WordPress).
        </li>
        <li>
          <strong>A hosted LinkedIn sign-in service</strong> for WordPress plugins such as Epexta Social Publisher. We hold
          the LinkedIn app credentials so you do not need your own LinkedIn developer app. The plugin then publishes
          posts directly from your website to LinkedIn.
        </li>
      </ul>

      <h2>Your account</h2>
      <p>
        You are responsible for the activity on your account and for keeping your password and API keys secret. Tell us
        promptly if you think they have been exposed. You must provide accurate details and be allowed to connect the
        sites and accounts you add.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use Epexta to break the law, spam, or publish content you have no right to publish.</li>
        <li>Follow the terms of the services you connect, including LinkedIn&apos;s and WordPress hosts&apos;.</li>
        <li>Do not probe, overload, or attempt to bypass the security of Epexta.</li>
      </ul>

      <h2>Third-party services</h2>
      <p>
        Epexta connects to third-party services (LinkedIn, WordPress sites, Google, AI assistants). They are governed by
        their own terms, and we are not responsible for their availability or changes. You can revoke Epexta&apos;s
        access at any time from the third party&apos;s settings or from your Epexta account.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of the content you publish through Epexta. You are responsible for it, including anything an
        AI assistant drafts or publishes on your behalf.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We work to keep Epexta available but provide it &quot;as is&quot;, without guarantees of uninterrupted service.
        We may change or discontinue features, and may suspend accounts that breach these terms. We will update this page
        when the terms change.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect or consequential loss, or for loss caused by
        third-party services or by content published through your account.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href="https://whitewayweb.com">whitewayweb.com</a>. See also our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>
    </LegalPage>
  );
}
