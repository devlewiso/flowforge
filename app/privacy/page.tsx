import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage } from "@/components/LegalPage";
import { PROVIDER_POLICIES, SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy · FlowForge" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <>
          <b>Short version:</b> FlowForge has no accounts, no database, no cookies and no analytics. Your
          description and API key pass through our server only to reach the AI provider you pick, and are not
          stored. Your browser keeps your settings, and your keys only if you ask it to.
        </>
      }
    >
      <h2>1. Who we are</h2>
      <p>
        {SITE.name} is operated by {SITE.operator}. Questions or requests about your data: <Contact />.
      </p>

      <h2>2. What we process and why</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Where it goes</th>
            <th>Kept?</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>The automation you describe</td>
            <td>Sent from your browser to our server, then to the AI provider you selected, to generate the workflow.</td>
            <td>Not stored or logged by us.</td>
          </tr>
          <tr>
            <td>Your API key</td>
            <td>Sent with each request to our server, which forwards it to that provider only.</td>
            <td>Never stored or logged by us.</td>
          </tr>
          <tr>
            <td>The generated workflow</td>
            <td>Returned to your browser.</td>
            <td>Not stored by us.</td>
          </tr>
          <tr>
            <td>Technical request data (see section 4)</td>
            <td>Our server&apos;s log.</td>
            <td>
              {SITE.logRetentionDays
                ? `Up to ${SITE.logRetentionDays} days.`
                : "For as long as the hosting provider's log retention keeps it."}
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        We process this only to provide the service you request and to keep it secure (preventing abuse and
        attacks). We do not sell data, build profiles, or use your content to train models.
      </p>

      <h2>3. AI providers</h2>
      <p>
        When you choose a cloud provider, your description is sent to that provider under <b>your</b> account and
        API key, and their terms and privacy policy apply to that processing. If you choose a local model (Ollama
        or a custom endpoint on your machine), nothing leaves your computer.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Privacy policy</th>
          </tr>
        </thead>
        <tbody>
          {PROVIDER_POLICIES.map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              <td>
                <a href={p.privacy} target="_blank" rel="noreferrer">
                  {p.privacy}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>4. Server logs</h2>
      <p>For security, our server writes one line per API request with:</p>
      <ul>
        <li>time, route, response status and duration;</li>
        <li>the provider and model used, and whether the key came from you or from the server;</li>
        <li>the host of a custom endpoint, if you used one, and the request&apos;s Origin header;</li>
        <li>
          your IP address, only when the server runs behind a proxy configured to pass it (otherwise it is
          recorded as &quot;direct&quot;);
        </li>
        <li>a short reason when a request is blocked (for example, a rate limit).</li>
      </ul>
      <p>
        The log never contains your API key, your description or the generated workflow. To enforce rate limits,
        the server also keeps request counts per IP address in memory for 10 minutes; they are lost when the
        server restarts.
      </p>

      <h2>5. What your browser stores</h2>
      <p>FlowForge uses your browser&apos;s local storage (not cookies), only on your device:</p>
      <ul>
        <li>your chosen provider, model and local endpoint, so they are there next time;</li>
        <li>
          your API keys, <b>only</b> if you tick &quot;Remember keys on this device&quot;. Unticking it deletes
          them. Anyone with access to your browser profile could read them, so don&apos;t use it on shared
          computers.
        </li>
      </ul>
      <p>You can erase all of it by clearing this site&apos;s data in your browser.</p>

      <h2>6. Your rights</h2>
      <p>
        Because we keep no account or content, there is usually nothing of yours to access or delete beyond the
        technical logs above. You can ask about or object to that processing at <Contact />. Depending on where
        you live (for example under the GDPR or Guatemalan law), you may also have the right to complain to your
        data protection authority.
      </p>

      <h2>7. Children</h2>
      <p>FlowForge is not intended for anyone under {SITE.minimumAge}.</p>

      <h2>8. Security</h2>
      <p>
        See our <Link href="/security">Security page</Link> for how requests, keys and generated workflows are
        protected.
      </p>

      <h2>9. Changes</h2>
      <p>
        If this policy changes, we will update this page and its effective date. Material changes will be
        highlighted on the home page.
      </p>
    </LegalPage>
  );
}
