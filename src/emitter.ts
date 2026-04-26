import type { BodyLine, Diagram } from "./ast.js";
import type { LinkedProgram } from "./linker.js";
import { IDENT_PATTERN } from "./patterns.js";

/**
 * The data shape the emitter writes to `diagrams.json`. Matches the schema
 * the viewer consumes from the static shell.
 */
export interface DiagramsOutput {
  /** Root diagram id. */
  root: string;
  /** All diagrams keyed by id. */
  diagrams: Record<string, EmittedDiagram>;
}

export interface EmittedDiagram {
  id: string;
  title: string;
  /** Raw Mermaid source ready to be passed to `mermaid.render`. */
  mermaid: string;
  /** Refs in source order, used by the viewer to rebuild click targets. */
  refs: { ref: string; label: string; anchor: string | null }[];
}

/**
 * Marker format injected into Mermaid source at each `ref` site. The viewer
 * regex-matches this in rendered SVG text and replaces it with a clickable
 * handle. Zero-width spaces make the marker invisible if stripping fails.
 *
 * Format: `\u200B⟦ireko:ID⟧\u200B` — the bracket pair is the
 * MATHEMATICAL WHITE SQUARE BRACKET (U+27E6 / U+27E7), rare in user text.
 */
export const IREKO_MARKER_OPEN = "\u200B\u27E6ireko:";
export const IREKO_MARKER_CLOSE = "\u27E7\u200B";
/** Regex the viewer uses to locate markers in rendered SVG text. */
export const IREKO_MARKER_REGEX = new RegExp(
  `\u200B?\u27E6ireko:(${IDENT_PATTERN})\u27E7\u200B?`,
  "g",
);

/** Produce the emitter output for a linked program. */
export function emit(program: LinkedProgram): DiagramsOutput {
  const out: DiagramsOutput = { root: program.rootId, diagrams: {} };
  for (const [id, diagram] of program.diagrams) {
    out.diagrams[id] = emitDiagram(diagram, program);
  }
  return out;
}

type HostType = "sequence" | "flowchart" | "state" | "mindmap" | "class" | "timeline" | "other";

function detectHost(body: BodyLine[]): { type: HostType; header: string } {
  for (const line of body) {
    if (line.kind !== "raw") continue;
    const t = line.text.trim();
    if (t === "") continue;
    if (/^sequenceDiagram\b/.test(t)) return { type: "sequence", header: t };
    if (/^(flowchart|graph)\b/.test(t)) return { type: "flowchart", header: t };
    if (/^stateDiagram(-v2)?\b/.test(t)) return { type: "state", header: t };
    if (/^mindmap\b/.test(t)) return { type: "mindmap", header: t };
    if (/^classDiagram\b/.test(t)) return { type: "class", header: t };
    if (/^timeline\b/.test(t)) return { type: "timeline", header: t };
    return { type: "other", header: t };
  }
  return { type: "other", header: "" };
}

function emitDiagram(diagram: Diagram, program: LinkedProgram): EmittedDiagram {
  const host = detectHost(diagram.body);
  const refs: EmittedDiagram["refs"] = [];
  const outLines: string[] = [];

  let lastParticipant: string | null = null;
  const participants: string[] = [];
  let anchoredClassEmitted = false;

  for (const line of diagram.body) {
    if (line.kind === "raw") {
      outLines.push(line.text);
      const p = extractParticipant(line.text);
      if (p !== null) {
        lastParticipant = p;
        if (!participants.includes(p)) participants.push(p);
      }
      continue;
    }

    // Ref line — substitute based on host type.
    const target = line.target;
    const targetDiagram = program.diagrams.get(target)!;
    const label = targetDiagram.title;
    const anchor = line.anchor;
    refs.push({ ref: target, label, anchor });
    const marker = `${IREKO_MARKER_OPEN}${target}${IREKO_MARKER_CLOSE}`;
    const indent = extractIndent(line);

    if (anchor !== null) {
      // Anchored ref — bind to an existing element, don't create a new one.
      // Anchor may be comma-separated (e.g., "C,S" for Note over C,S:).
      // Flowchart `click` only takes a single node id, so use the first.
      const firstAnchor = anchor.split(",")[0];
      switch (host.type) {
        case "flowchart": {
          outLines.push(`${indent}click ${firstAnchor} "#${target}"`);
          if (!anchoredClassEmitted) {
            outLines.push(`${indent}classDef ireko_ref stroke:#2563eb,stroke-width:2px`);
            anchoredClassEmitted = true;
          }
          outLines.push(`${indent}class ${firstAnchor} ireko_ref`);
          break;
        }
        case "sequence": {
          outLines.push(`${indent}Note over ${anchor}: 🔍 ${label}${marker}`);
          break;
        }
        case "state": {
          outLines.push(`${indent}state "🔍 ${label}${marker}" as ${anchor}_ref`);
          break;
        }
        case "mindmap":
        case "timeline": {
          // No click directive — emit a visible node with the marker.
          outLines.push(`${indent}🔍 ${label}${marker}`);
          break;
        }
        case "class": {
          // classDiagram supports native click binding.
          outLines.push(`${indent}click ${firstAnchor} href "#${target}"`);
          break;
        }
        case "other": {
          outLines.push(`${indent}%% ref: ${anchor} > ${target}`);
          break;
        }
      }
    } else {
      // Standalone ref — create a new placeholder element.
      switch (host.type) {
        case "sequence": {
          const SYNTHETIC_ACTOR = "__ireko_actor";
          const noteAnchor = lastParticipant ?? participants[0] ?? SYNTHETIC_ACTOR;
          if (lastParticipant === null && participants.length === 0) {
            outLines.push(`${indent}participant ${SYNTHETIC_ACTOR}`);
            lastParticipant = SYNTHETIC_ACTOR;
            participants.push(SYNTHETIC_ACTOR);
          }
          outLines.push(`${indent}Note over ${noteAnchor}: 🔍 ${label}${marker}`);
          break;
        }
        case "flowchart": {
          outLines.push(`${indent}__ref_${target}__["🔍 ${label}${marker}"]`);
          break;
        }
        case "state": {
          outLines.push(`${indent}state "🔍 ${label}${marker}" as ${target}_ref`);
          break;
        }
        case "mindmap":
        case "timeline": {
          outLines.push(`${indent}🔍 ${label}${marker}`);
          break;
        }
        case "class": {
          outLines.push(`${indent}note "🔍 ${label}${marker}"`);
          break;
        }
        case "other": {
          outLines.push(`${indent}%% ref: ${target}`);
          break;
        }
      }
    }
  }

  return {
    id: diagram.id!,
    title: diagram.title,
    mermaid: outLines.join("\n"),
    refs,
  };
}

const PARTICIPANT_RE = new RegExp(
  `^(?:participant|actor)\\s+(${IDENT_PATTERN})(?:\\s|$)`,
);

/** The actor id (not display name) if this line declares one; else null. */
function extractParticipant(text: string): string | null {
  const m = PARTICIPANT_RE.exec(text.trim());
  return m ? m[1] : null;
}

function extractIndent(line: { pos: { col: number } }): string {
  return " ".repeat(Math.max(0, line.pos.col - 1));
}
