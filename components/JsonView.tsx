"use client";

import { useMemo } from "react";

interface Token {
  text: string;
  className: string;
}

const COLORS = {
  key: "text-[#7dd3fc]",
  string: "text-[#c9f27c]",
  number: "text-[#fb923c]",
  keyword: "text-[#c4b5fd]",
  punct: "text-[#5b697c]",
  plain: "text-[#aab6c6]",
};

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > last) {
      tokens.push({ text: source.slice(last, match.index), className: COLORS.punct });
    }
    if (match[1] !== undefined) {
      if (match[2] !== undefined) {
        tokens.push({ text: match[1], className: COLORS.key });
        tokens.push({ text: match[2], className: COLORS.punct });
      } else {
        tokens.push({ text: match[1], className: COLORS.string });
      }
    } else if (match[3] !== undefined) {
      tokens.push({ text: match[3], className: COLORS.keyword });
    } else if (match[4] !== undefined) {
      tokens.push({ text: match[4], className: COLORS.number });
    }
    last = pattern.lastIndex;
  }

  if (last < source.length) {
    tokens.push({ text: source.slice(last), className: COLORS.plain });
  }
  return tokens;
}

export function JsonView({ workflow }: { workflow: unknown }) {
  const pretty = useMemo(() => JSON.stringify(workflow, null, 2), [workflow]);
  const tokens = useMemo(() => tokenize(pretty), [pretty]);
  const lines = useMemo(() => pretty.split("\n").length, [pretty]);

  return (
    <div className="overflow-hidden rounded-xl border border-line-soft bg-[#090b10]">
      <div className="flex items-center justify-between border-b border-line-soft px-3 py-2">
        <span className="font-mono text-[11px] text-muted">workflow.json</span>
        <span className="font-mono text-[10.5px] text-[#5b697c]">{lines} lines</span>
      </div>
      <pre className="scroll-thin max-h-[560px] overflow-auto px-4 py-3 font-mono text-[12px] leading-[1.65]">
        <code>
          {tokens.map((token, index) => (
            <span key={index} className={token.className}>
              {token.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
