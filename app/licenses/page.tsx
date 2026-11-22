import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { SITE } from "@/lib/site";
import licenses from "@/lib/licenses.json";

export const metadata: Metadata = { title: "Licenses · FlowForge" };

export default function LicensesPage() {
  return (
    <LegalPage title="Licenses and credits">
      <h2>FlowForge</h2>
      <p>
        © 2026 {SITE.operator}. Open source under the{" "}
        <a href={`${SITE.repo}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT License</a>: the code is on{" "}
        <a href={SITE.repo} target="_blank" rel="noreferrer">GitHub</a>. Workflows you generate are yours (see the Terms).
      </p>

      <h2>Open-source software</h2>
      <p>FlowForge is built on these packages, used under their licenses:</p>
      <table>
        <thead>
          <tr>
            <th>Package</th>
            <th>Version</th>
            <th>License</th>
          </tr>
        </thead>
        <tbody>
          {licenses.map((l) => (
            <tr key={l.name}>
              <td>
                <a href={l.url} target="_blank" rel="noreferrer">{l.name}</a>
              </td>
              <td>{l.version}</td>
              <td>{l.license}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Their own dependencies keep their respective licenses.</p>

      <h2>Logos</h2>
      <p>
        Provider logos for Claude, Gemini, OpenRouter and Ollama come from{" "}
        <a href="https://simpleicons.org" target="_blank" rel="noreferrer">Simple Icons</a> (CC0). OpenAI and
        Groq are shown as text marks. All trademarks belong to their owners; FlowForge is not affiliated with
        them.
      </p>

      <h2>n8n</h2>
      <p>
        FlowForge produces files for <a href="https://n8n.io" target="_blank" rel="noreferrer">n8n</a>, which
        is distributed under its{" "}
        <a href="https://docs.n8n.io/sustainable-use-license/" target="_blank" rel="noreferrer">
          Sustainable Use License
        </a>
        . FlowForge does not include or redistribute n8n.
      </p>
    </LegalPage>
  );
}
