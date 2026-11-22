"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GROUP_META, groupForType, isTriggerType, nodeTypeLabel } from "@/lib/nodes";
import type { N8nNode, N8nWorkflow } from "@/lib/n8n";

interface Hover {
  node: N8nNode;
  left: number;
  top: number;
  below: boolean;
}

const CARD_W = 206;
const CARD_H = 112;
const COL_GAP = 44;
const ROW_GAP = 22;
const MIN_SCALE = 0.62;
const BAND_GAP = 56;
const PAD = 20;

interface Point {
  x: number;
  y: number;
}

export function FlowDiagram({ workflow }: { workflow: N8nWorkflow }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const nodes = workflow.nodes;

  // Fit the whole diagram to the panel width (down to MIN_SCALE, then scroll).
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fixed-position tooltip so the scroll container never clips it.
  const showFor = (node: N8nNode, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const below = r.top < 150;
    setHover({ node, left: Math.min(Math.max(r.left + r.width / 2, 170), window.innerWidth - 170), top: below ? r.bottom + 10 : r.top - 10, below });
  };
  const nodeNames = new Set(nodes.map((n) => n.name));

  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.name, []);
  for (const [source, conn] of Object.entries(workflow.connections)) {
    if (!nodeNames.has(source)) continue;
    const targets = conn.main.flat().map((t) => t.node).filter((t) => nodeNames.has(t));
    adjacency.set(source, [...new Set(targets)]);
  }

  const level = new Map<string, number>(nodes.map((n) => [n.name, 0]));
  for (let pass = 0; pass < nodes.length + 1; pass += 1) {
    let changed = false;
    for (const [source, targets] of adjacency) {
      const base = level.get(source) ?? 0;
      for (const target of targets) {
        if (target === source) continue;
        if ((level.get(target) ?? 0) < base + 1) {
          level.set(target, base + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const maxLevel = Math.max(...nodes.map((n) => level.get(n.name) ?? 0), 0);
  const columns: string[][] = Array.from({ length: maxLevel + 1 }, () => []);
  nodes.forEach((node, index) => {
    const l = level.get(node.name) ?? 0;
    columns[l].push(`${index}`);
  });

  // Long chains wrap into bands (like lines of text) instead of shrinking.
  const fitCols = frameWidth > 0 ? Math.max(1, Math.floor((frameWidth - PAD * 2 + COL_GAP) / (CARD_W + COL_GAP))) : columns.length;
  const colsPerBand = Math.max(1, Math.min(columns.length, fitCols));
  const bands = Math.ceil(columns.length / colsPerBand);
  // Each band is only as tall as its own tallest column.
  const bandRows = Array.from({ length: bands }, (_, b) =>
    Math.max(1, ...columns.slice(b * colsPerBand, (b + 1) * colsPerBand).map((c) => c.length)),
  );
  const bandTop: number[] = [];
  bandRows.reduce((y, rows, b) => {
    bandTop[b] = y;
    return y + rows * CARD_H + (rows - 1) * ROW_GAP + BAND_GAP;
  }, PAD);

  const position = new Map<string, Point>();
  columns.forEach((column, columnIndex) => {
    const band = Math.floor(columnIndex / colsPerBand);
    const col = columnIndex % colsPerBand;
    column.forEach((indexStr, rowIndex) => {
      const node = nodes[Number(indexStr)];
      position.set(node.name, {
        x: PAD + col * (CARD_W + COL_GAP),
        y: bandTop[band] + rowIndex * (CARD_H + ROW_GAP),
      });
    });
  });

  const width = PAD * 2 + colsPerBand * CARD_W + (colsPerBand - 1) * COL_GAP;
  const lastRows = bandRows[bands - 1];
  const height = bandTop[bands - 1] + lastRows * CARD_H + (lastRows - 1) * ROW_GAP + PAD;

  const edges: Array<{ key: string; d: string; label?: string }> = [];
  for (const [source, conn] of Object.entries(workflow.connections)) {
    const from = position.get(source);
    if (!from) continue;
    conn.main.forEach((output, outputIndex) => {
      output.forEach((target, targetIndex) => {
        const to = position.get(target.node);
        if (!to || target.node === source) return;
        let d: string;
        let x1: number;
        let y1: number;
        if (to.x > from.x) {
          x1 = from.x + CARD_W;
          y1 = from.y + CARD_H / 2;
          const x2 = to.x;
          const y2 = to.y + CARD_H / 2;
          const bend = Math.max(40, Math.abs(x2 - x1) / 2);
          d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
        } else {
          // Wraps to the next band: down, back to the left, down into the target.
          x1 = from.x + CARD_W / 2;
          y1 = from.y + CARD_H;
          const x2 = to.x + CARD_W / 2;
          const y2 = to.y;
          const mid = to.y - BAND_GAP / 2;
          d = `M ${x1} ${y1} V ${mid - 8} Q ${x1} ${mid} ${x1 - 8} ${mid} H ${x2 + 8} Q ${x2} ${mid} ${x2} ${mid + 8} V ${y2}`;
        }
        const multiple = conn.main.filter((o) => o.length > 0).length > 1;
        let label: string | undefined;
        if (multiple) {
          if (/\.if$/.test(source)) label = outputIndex === 0 ? "true" : "false";
          else if (/\.switch$/.test(source)) label = String(outputIndex + 1);
          else if (output.length > 1) label = String(targetIndex + 1);
        }
        edges.push({ key: `${source}-${target.node}-${outputIndex}-${targetIndex}`, d, label });
      });
    });
  }

  const groups = [...new Set(nodes.map((n) => groupForType(n.type)))];
  const scale = frameWidth > 0 ? Math.max(MIN_SCALE, Math.min(1, frameWidth / width)) : 1;

  return (
    <div className="w-full">
      <div ref={frameRef} className="scroll-thin overflow-auto rounded-xl border border-line-soft bg-[#090b10]">
        <div className="relative mx-auto" style={{ width: width * scale, height: height * scale }}>
        <div
          className="dot-grid absolute left-0 top-0 origin-top-left"
          style={{ width, height, transform: `scale(${scale})` }}
        >
          <svg
            className="absolute inset-0"
            width={width}
            height={height}
            role="img"
            aria-label={`Workflow diagram with ${nodes.length} nodes and ${edges.length} connections`}
          >
            <defs>
              <marker
                id="flow-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#3d4b5e" />
              </marker>
            </defs>
            {edges.map((edge) => (
              <path
                key={edge.key}
                d={edge.d}
                fill="none"
                stroke="#3d4b5e"
                strokeWidth={1.6}
                markerEnd="url(#flow-arrow)"
              />
            ))}
            {edges.map((edge) => {
              if (!edge.label) return null;
              const parts = edge.d.match(/M ([\d.]+) ([\d.]+) C/);
              if (!parts) return null;
              return (
                <text
                  key={`${edge.key}-label`}
                  x={Number(parts[1]) + 12}
                  y={Number(parts[2]) - 7}
                  fill="#7d8ca1"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                >
                  {edge.label}
                </text>
              );
            })}
          </svg>

          {nodes.map((node, index) => {
            const point = position.get(node.name)!;
            const group = groupForType(node.type);
            const meta = GROUP_META[group];
            return (
              <div
                key={node.id}
                className={`absolute flex cursor-help items-center gap-2.5 rounded-xl border bg-[#10141c] px-3 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_10px_24px_-16px_rgba(0,0,0,0.9)] transition focus:outline-none ${
                  hover?.node.id === node.id ? "border-accent/60" : "border-[#232c38]"
                }`}
                style={{ left: point.x, top: point.y, width: CARD_W, height: CARD_H }}
                tabIndex={0}
                aria-describedby={hover?.node.id === node.id ? "node-tip" : undefined}
                onMouseEnter={(e) => showFor(node, e.currentTarget)}
                onMouseLeave={() => setHover(null)}
                onFocus={(e) => showFor(node, e.currentTarget)}
                onBlur={() => setHover(null)}
              >
                <span
                  className="mt-3 flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-lg text-sm"
                  style={{ background: `${meta.color}1f`, color: meta.color }}
                  aria-hidden="true"
                >
                  {meta.glyph}
                </span>
                <span className="min-w-0 flex-1 self-start pt-3">
                  <span className="block truncate text-[12.5px] font-medium leading-tight text-[#e9edf3]">
                    {node.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] text-muted">
                    {nodeTypeLabel(node.type)}
                    <span className="text-[#39434f]">·</span>
                    v{node.typeVersion}
                  </span>
                  {node.notes && (
                    <span className="mt-1.5 line-clamp-2 text-[10.5px] leading-snug text-[#8b98ab]">{node.notes}</span>
                  )}
                </span>
                {isTriggerType(node.type) && (
                  <span className="absolute -top-2 right-2 rounded-full border border-[#f59e0b]/40 bg-[#2a1f0d] px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-[#f5b544]">
                    trigger
                  </span>
                )}
                <span className="absolute bottom-1 right-2 font-mono text-[9px] text-[#3d4b5e]">
                  {index + 1}
                </span>
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {hover &&
        typeof document !== "undefined" &&
        createPortal(
        <div
          id="node-tip"
          role="tooltip"
          className="pointer-events-none fixed z-50 w-[320px] rounded-xl border border-line bg-[#0d1017]/95 p-3 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.85)] backdrop-blur"
          style={{ left: hover.left, top: hover.top, transform: `translate(-50%, ${hover.below ? "0" : "-100%"})` }}
        >
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#e9edf3]">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: GROUP_META[groupForType(hover.node.type)].color }}
              aria-hidden="true"
            />
            {hover.node.name}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted">
            {nodeTypeLabel(hover.node.type)} · {hover.node.type}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-[#c3ccd9]">
            {hover.node.notes ?? "No explanation from the model for this node."}
          </p>
        </div>,
          document.body,
        )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
        {groups.map((group) => (
          <span key={group} className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: GROUP_META[group].color }}
              aria-hidden="true"
            />
            {GROUP_META[group].label}
          </span>
        ))}
        <span className="ml-auto font-mono text-[10.5px] text-[#5b697c]">
          hover a node to see what it does · {nodes.length} nodes · {edges.length} connections
        </span>
      </div>
    </div>
  );
}
