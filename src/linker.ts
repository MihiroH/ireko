import type { Diagram, File, RefLine } from "./ast.js";
import { IrekoError } from "./errors.js";

/**
 * A linked ireko program: a diagram graph with the root identified, refs
 * resolved to diagram ids, and the whole thing validated (no undefined refs,
 * no cycles, all non-root diagrams are reachable — reachability is a warning).
 */
export interface LinkedProgram {
  /** Guaranteed to exist in `diagrams` (synthesized if the author omitted it). */
  rootId: string;
  diagrams: Map<string, Diagram>;
  /** Non-fatal compiler warnings (e.g., unreachable diagrams). */
  warnings: string[];
}

/**
 * Synthetic id assigned to the root diagram when the author omitted it.
 * Starts with non-ident chars so it cannot collide with a user identifier.
 */
export const SYNTHETIC_ROOT_ID = "__root__";

/**
 * Links a parsed ireko file: resolves refs, detects duplicate ids, undefined
 * refs, self-references, and cycles. Unreachable non-root diagrams become
 * warnings rather than errors.
 */
export function link(file: File): LinkedProgram {
  const diagrams = new Map<string, Diagram>();

  for (const d of file.diagrams) {
    const id = d.id ?? (d.isRoot ? SYNTHETIC_ROOT_ID : null);
    if (id === null) {
      // Parser enforces this; belt-and-braces.
      throw new IrekoError(
        `non-root diagram "${d.title}" is missing an identifier`,
        d.pos,
      );
    }
    if (diagrams.has(id)) {
      throw new IrekoError(`duplicate diagram identifier '${id}'`, d.pos);
    }
    diagrams.set(id, { ...d, id });
  }

  const roots = [...diagrams.values()].filter((d) => d.isRoot);
  if (roots.length !== 1) {
    throw new IrekoError(
      `internal: expected exactly one root diagram, found ${roots.length}`,
    );
  }
  const rootId = roots[0].id!;

  const children = new Map<string, string[]>();
  for (const [id, d] of diagrams) {
    const childIds: string[] = [];
    for (const ref of d.body.filter((b): b is RefLine => b.kind === "ref")) {
      if (!diagrams.has(ref.target)) {
        throw new IrekoError(
          `undefined ref: no diagram named '${ref.target}'`,
          ref.pos,
        );
      }
      if (ref.target === id) {
        throw new IrekoError(`diagram '${id}' references itself`, ref.pos);
      }
      childIds.push(ref.target);
    }
    children.set(id, childIds);
  }

  detectCycles(diagrams, children);

  const reachable = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const n = stack.pop()!;
    if (reachable.has(n)) continue;
    reachable.add(n);
    for (const c of children.get(n) ?? []) stack.push(c);
  }
  const warnings: string[] = [];
  for (const [id, d] of diagrams) {
    if (!reachable.has(id)) {
      warnings.push(
        `diagram '${id}' ("${d.title}") is defined but never referenced from the root`,
      );
    }
  }

  return { rootId, diagrams, warnings };
}

/**
 * One DFS pass that visits every node (handles disconnected components too).
 * Throws on the first back-edge with the full cycle path in the message.
 */
function detectCycles(
  diagrams: Map<string, Diagram>,
  children: Map<string, string[]>,
): void {
  const visited = new Set<string>();
  const path: string[] = [];
  const onPath = new Set<string>();

  const visit = (node: string): void => {
    if (onPath.has(node)) {
      const cycle = path.slice(path.indexOf(node)).concat(node).join(" -> ");
      throw new IrekoError(
        `cycle detected: ${cycle}`,
        diagrams.get(node)?.pos ?? null,
      );
    }
    if (visited.has(node)) return;
    visited.add(node);
    onPath.add(node);
    path.push(node);
    for (const child of children.get(node) ?? []) visit(child);
    path.pop();
    onPath.delete(node);
  };

  for (const id of diagrams.keys()) visit(id);
}
