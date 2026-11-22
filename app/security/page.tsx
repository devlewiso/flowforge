import type { Metadata } from "next";
import { Contact, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Security · FlowForge" };

const ROWS: Array<[string, string]> = [
  ["Your API key leaking", "The key goes from your browser to this server and straight to the provider. It is never stored, logged or returned. \"Remember keys\" keeps it only in your browser."],
  ["A generated workflow that hands over your n8n server", "Nodes that run shell commands, SSH, read or write server files, call the n8n API, or code that reaches the operating system are blocked by default. If you allow them they are flagged in red, and any unauthenticated webhook or form that reaches them is called out."],
  ["Credentials inside workflows", "Any credentials the model invents are removed. You connect your own inside n8n."],
  ["Server-side request forgery", "Custom endpoints are off on public servers. When on (local use), they may only target localhost unless the operator allows other hosts. Redirects are not followed and error bodies from custom endpoints are never shown."],
  ["Another website driving FlowForge", "API calls must be JSON from this same site; anything else is rejected."],
  ["Abuse and runaway costs", "Per-IP rate limits on generation and model listing."],
  ["Clickjacking and injected scripts", "Strict Content-Security-Policy with no external scripts, and the page cannot be framed by other sites."],
  ["Silent attacks", "One audit line per API call (route, status, provider, key source, custom endpoint host, origin, reason). Never the key or your description."],
  ["Vulnerable dependencies", "Dependencies are audited; known vulnerabilities are patched before release."],
];

const TEAMS: Array<[string, string, string]> = [
  ["White team", "#e9edf3", "Sets the scope and the rules. Nothing outside the scope is touched, and every exercise is logged."],
  ["Red team", "#ff5a4e", "Thinks like an attacker and simulates attacks on an isolated lab copy, never on real people or third-party systems."],
  ["Blue team", "#3b82f6", "Makes sure abuse leaves a trace, so it can be seen and stopped."],
  ["Purple team", "#7a6cf0", "Turns every finding into a fix, then tests it again until it holds."],
];

const RESULTS: Array<[string, "held" | "fixed", string]> = [
  ["Using FlowForge to reach internal services", "fixed", "custom endpoints locked down on public servers"],
  ["Echoing internal error pages back to the browser", "fixed", "error bodies are never shown"],
  ["Another website silently driving FlowForge", "fixed", "same-site JSON only"],
  ["Odd URL schemes and embedded credentials", "held", ""],
  ["Your API key ending up in logs", "held", "the key never appears anywhere"],
  ["Asking the AI for a workflow that hands over the server", "fixed", "dangerous nodes blocked by default"],
  ["Flooding the service", "fixed", "per-IP rate limits"],
  ["Framing the page or injecting scripts", "fixed", "strict security headers"],
];

const IDEAS: Array<[string, string]> = [
  ["Lock the n8n editor", "Never expose the editor without a login, keep owner accounts on two-factor, and keep n8n updated."],
  ["Authenticate webhooks", "A public webhook is a public door. Add header or basic auth, or a signature check, and rate-limit it."],
  ["Least-privilege credentials", "Give each credential only the scopes the workflow needs, and keep secrets in n8n credentials, never inside node fields."],
  ["AI agent nodes", "Emails, forms and web pages can carry hidden instructions. Don't let an AI node send money, delete data or email customers without a human check."],
  ["Community nodes", "Install only community nodes you trust and review their updates: they run with your server's permissions."],
  ["Execution data", "Executions can store personal data. Set a retention period and prune old runs."],
  ["Backups and versions", "Export or version your workflows and credentials backup, and try a restore before you need it."],
  ["A real security test", "For workflows that touch payments or personal data, hire an authorized penetration test. Ethical testing always has written permission and a scope."],
];

export default function SecurityPage() {
  return (
    <LegalPage
      title="Security"
      intro={
        <>
          FlowForge writes automations that people run on their own servers, so it is built to fail safe. Last
          reviewed November 20, 2026 with a white/red/blue/purple team exercise; every finding was fixed and re-tested.
        </>
      }
    >
      <table>
        <thead>
          <tr>
            <th>Risk</th>
            <th>How FlowForge handles it</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([risk, how]) => (
            <tr key={risk}>
              <td>{risk}</td>
              <td>{how}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 id="benchmark">Security benchmark</h2>
      <p>Before launch, FlowForge went through the exercise every NeuralCodeLab product goes through. Four teams, each with one job:</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {TEAMS.map(([name, color, job]) => (
          <div key={name} className="rounded-xl border border-line-soft bg-panel-2 p-4">
            <p className="!mt-0 flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-wider !text-text">
              <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} />
              {name}
            </p>
            <p className="!mt-1.5">{job}</p>
          </div>
        ))}
      </div>

      <h3>Results</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["8", "attack scenarios simulated"], ["2", "held on the first try"], ["6", "found, fixed and re-tested"], ["0", "open findings at launch"]].map(([n, label]) => (
          <div key={label} className="rounded-xl border border-line-soft bg-panel-2 p-4">
            <div className="text-3xl font-semibold tracking-tight">{n}</div>
            <div className="mt-1 text-[12px] text-muted">{label}</div>
          </div>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {RESULTS.map(([scenario, result, note]) => (
            <tr key={scenario}>
              <td>{scenario}</td>
              <td>
                <span
                  className={`mr-2 inline-block rounded-full px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider ${
                    result === "held" ? "bg-[#19d39a]/15 text-[#5eead4]" : "bg-[#7a6cf0]/20 text-[#c4b5fd]"
                  }`}
                >
                  {result}
                </span>
                {note}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>What we are confident about</h3>
      <ul>
        <li>Your API key is used once, for your request, and never stored or logged.</li>
        <li>A public FlowForge can&apos;t be used as a door into anyone&apos;s private network.</li>
        <li>Workflows that could take over your n8n server are blocked unless you explicitly allow them, and then they are flagged in red.</li>
        <li>Abuse is limited and leaves an audit trail.</li>
      </ul>

      <h2 id="what-we-dont-cover">What FlowForge doesn&apos;t cover, and what you can do</h2>
      <p>
        FlowForge checks the workflow it writes, not the server you run it on or the data that flows through it later.
        Today everyone uses AI, on both sides: attackers use it to find exposed webhooks, write convincing phishing and
        hide instructions inside emails and web pages; defenders use it to review and monitor faster. Good next steps for
        your automations:
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {IDEAS.map(([title, text]) => (
          <div key={title} className="rounded-xl border border-line-soft bg-panel-2 p-4">
            <p className="!mt-0 font-mono text-[11.5px] uppercase tracking-wider !text-text">{title}</p>
            <p className="!mt-1.5">{text}</p>
          </div>
        ))}
      </div>

      <h2>Before you activate a workflow</h2>
      <ul>
        <li>Open every node in n8n and read its note: it says what the node is for.</li>
        <li>Connect credentials with the least permissions the workflow needs.</li>
        <li>Protect webhooks and forms with authentication when they trigger anything sensitive.</li>
        <li>Test with sample data before turning it on.</li>
      </ul>

      <h2>Report a vulnerability</h2>
      <p>
        Please write to <Contact /> with steps to reproduce. Don&apos;t test against other people&apos;s data, and
        give us reasonable time to fix the issue before disclosing it.
      </p>
    </LegalPage>
  );
}
