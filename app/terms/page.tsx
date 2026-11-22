import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage } from "@/components/LegalPage";
import { PROVIDER_POLICIES, SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Use · FlowForge" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      intro={
        <>
          <b>Short version:</b> FlowForge is a free tool that drafts n8n workflows with AI. Drafts can be wrong:
          review every workflow before you turn it on. You are responsible for your API keys, their costs, and
          following your AI provider&apos;s rules. Don&apos;t use it to harm anyone.
        </>
      }
    >
      <h2>1. Agreement</h2>
      <p>
        By using {SITE.name} you agree to these terms and to our <Link href="/privacy">Privacy Policy</Link>. If
        you don&apos;t agree, don&apos;t use it. You must be at least {SITE.minimumAge} years old.
      </p>

      <h2>2. What the service does</h2>
      <p>
        {SITE.name} turns a plain-language description into an n8n workflow file (<code>.json</code>) using an AI
        model you choose. It is provided free of charge, without accounts, and may change or stop at any time.
      </p>

      <h2>3. AI output may be wrong</h2>
      <ul>
        <li>
          Generated workflows are drafts. They may use the wrong nodes or parameters, miss steps, or behave
          differently than you expect.
        </li>
        <li>
          You must review, test with sample data, and configure credentials and permissions before activating any
          workflow. You are responsible for what your workflows do once you run them.
        </li>
        <li>
          Nodes that can run commands, access files or control n8n are blocked by default. If you allow them, you
          accept the risk.
        </li>
      </ul>

      <h2>4. Your API keys and providers</h2>
      <p>
        When you use a cloud provider, you do so with your own account. Usage is billed to you by that provider,
        and you must follow its terms and usage policies:
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Terms</th>
            <th>Usage policy</th>
          </tr>
        </thead>
        <tbody>
          {PROVIDER_POLICIES.map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              <td>
                <a href={p.terms} target="_blank" rel="noreferrer">Terms</a>
              </td>
              <td>
                <a href={p.usage} target="_blank" rel="noreferrer">Usage policy</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Keep your keys secret. Don&apos;t paste keys you are not authorized to use. Local models (Ollama or a
        custom endpoint) are subject to their own licenses.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You may not use {SITE.name} to:</p>
      <ul>
        <li>break the law or infringe anyone&apos;s rights;</li>
        <li>
          build workflows for malware, unauthorized access, credential theft, denial-of-service, or scanning
          systems you are not allowed to test;
        </li>
        <li>send spam, run fraud or phishing, or collect personal data without a legal basis;</li>
        <li>
          attack, overload or probe this service, get around its rate limits or protections, or make it call
          systems you don&apos;t control;
        </li>
        <li>violate the usage policy of the AI provider you are using.</li>
      </ul>
      <p>We may block requests or access that break these rules.</p>

      <h2>6. Your content</h2>
      <p>
        You keep whatever rights you have in your descriptions and in the workflows generated for you, subject
        to your AI provider&apos;s terms. We claim no ownership of them and do not store them.
      </p>

      <h2>7. Trademarks</h2>
      <p>
        n8n, OpenAI, Anthropic, Claude, Google, Gemini, OpenRouter, Groq, Ollama and other names belong to their
        owners. {SITE.name} is an independent project and is not affiliated with, endorsed by, or sponsored by
        any of them. Logos are shown only to identify each provider.
      </p>

      <h2>8. No warranty</h2>
      <p>
        {SITE.name} is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind,
        including fitness for a particular purpose, accuracy of output, or uninterrupted availability.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {SITE.operator} is not liable for indirect, incidental or
        consequential damages, lost data or profits, provider charges, or damage caused by workflows you run.
        Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>10. Changes and law</h2>
      <p>
        We may update these terms; the effective date above shows the current version, and continued use means
        you accept it.
        {SITE.governingLaw ? ` These terms are governed by the laws of ${SITE.governingLaw}.` : ""}
      </p>

      <h2>11. Contact</h2>
      <p>
        <Contact />
      </p>
    </LegalPage>
  );
}
