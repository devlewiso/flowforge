"use client";

import { groupForType, GROUP_META, nodeTypeLabel } from "@/lib/nodes";
import type { ReviewCheckKind, ReviewDecision, ReviewItem } from "@/lib/review";

const CHECK_STYLE: Record<ReviewCheckKind, { label: string; className: string }> = {
  credential: { label: "Credential", className: "border-[#a78bfa]/35 bg-[#a78bfa]/10 text-[#c4b5fd]" },
  write: { label: "Writes data", className: "border-[#fbbf24]/35 bg-[#fbbf24]/10 text-[#fcd34d]" },
  target: { label: "Fields & target", className: "border-[#38bdf8]/30 bg-[#38bdf8]/10 text-[#7dd3fc]" },
};

const DECISIONS: Array<{ id: ReviewDecision; label: string; active: string }> = [
  { id: "approved", label: "Approve as generated", active: "border-[#34d399]/50 bg-[#34d399]/15 text-[#6ee7b7]" },
  { id: "changed", label: "I changed it", active: "border-accent/60 bg-accent/15 text-accent-soft" },
];

export function ReviewPanel({
  items,
  decisions,
  onDecide,
  onDownloadLog,
}: {
  items: ReviewItem[];
  decisions: Record<string, ReviewDecision>;
  onDecide: (node: string, decision: ReviewDecision) => void;
  onDownloadLog: () => void;
}) {
  const flagged = items.filter((i) => i.checks.length > 0);
  const signed = flagged.filter((i) => (decisions[i.node] ?? "pending") !== "pending").length;
  const changed = items.filter((i) => decisions[i.node] === "changed").length;
  const ordered = [...flagged, ...items.filter((i) => i.checks.length === 0)];

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-soft bg-panel-2 px-3 py-2.5 text-[11.5px] text-muted">
        <span className="font-medium text-[#c3ccd9]">
          {signed} of {flagged.length} {flagged.length === 1 ? "node" : "nodes"} signed off
        </span>
        <span className="text-[#39434f]">·</span>
        <span>
          Every node was picked by the model. Mark what you approved and what you changed, then keep the review log with the
          workflow.
        </span>
        <button
          type="button"
          onClick={onDownloadLog}
          className="ml-auto rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[11px] text-[#c3ccd9] transition hover:text-text"
        >
          Download review log
        </button>
      </div>
      {changed > 0 && (
        <p className="px-1 text-[10.5px] text-[#8b98ab]">
          {changed} {changed === 1 ? "node" : "nodes"} marked as changed by a person.
        </p>
      )}

      {ordered.map((item) => {
        const decision = decisions[item.node] ?? "pending";
        return (
          <div key={item.node} className="rounded-lg border border-line-soft bg-panel-2 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: GROUP_META[groupForType(item.type)].color }}
                aria-hidden="true"
              />
              <span className="text-[12.5px] font-medium text-text">{item.node}</span>
              <span className="text-[10.5px] text-[#5b697c]">{nodeTypeLabel(item.type)} · chosen by the model</span>
              <div className="ml-auto flex gap-1" role="group" aria-label={`Review of ${item.node}`}>
                {DECISIONS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={decision === d.id}
                    onClick={() => onDecide(item.node, decision === d.id ? "pending" : d.id)}
                    className={`rounded-md border px-2 py-1 text-[10.5px] transition ${
                      decision === d.id ? d.active : "border-line bg-panel text-muted hover:text-text"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            {item.checks.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-[#5b697c]">No credential, write or target to confirm.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {item.checks.map((check, index) => (
                  <li key={index} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[#c3ccd9]">
                    <span
                      className={`mt-px shrink-0 rounded border px-1.5 py-px text-[9.5px] font-medium uppercase tracking-wide ${CHECK_STYLE[check.kind].className}`}
                    >
                      {CHECK_STYLE[check.kind].label}
                    </span>
                    {check.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
