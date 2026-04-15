import type { Diagram, File, RefLine } from "./ast.js";
import { IrekoError } from "./errors.js";

/**
 * A linked ireko program: a diagram graph with the root identified, refs
 * resolved to diagram ids, and the whole thing validated (no undefined refs,
 * no cycles, all non-root diagrams are reachable — reachability is a warning).
 */
export interface LinkedProgram {
  /** Id of the root diagram. The root diagram is guaranteed to have an id (synthesized if needed). */
  rootId: string;
  /** Map from diagram id → diagram node. */
  diagrams: Map<string, Diagram>;
  /** Adjacency: diagramId → list of child diagram ids in source order. */
  children: Map<string, string[]>;
  /** Warnings that don't fail the build (e.g., unused diagrams). */
  warnings: string[];
}

/**
 * Synthetic id assigned to the root diagram when the author omitted it.
 * Chosen so it cannot collide with a user identifier (starts with non-ident char).
 */
export const SYNTHETIC_ROOT_ID = "__root__";

/**
 * Links a parsed ireko file: resolves refs, detects duplicate ids, undefined
 * refs, and cycles. Returns a {@link LinkedProgram} suitable for emission.
 *
 * Duplicate ids, undefined refs, and cycles are all compile errors.
 * Unused (unreachable) non-root diagrams emit a warning.
 */
export function link(file: File): LinkedProgram {
  const diagrams = new Map<string, Diagram>();

  // 1. Assign an id to every diagram (synthesize one for an anonymous root).
  for (const d of file.diagrams) {
    const id = d.id ?? (d.isRoot ? SYNTHETIC_ROOT_ID : null);
    if (id === null) {
      // Parser already enforces this, but guard anyway.
      throw new IrekoError(
        `non-root diagram "${d.title}" is missing an identifier`,
        d.pos,
      );
    }
    if (diagrams.has(id)) {
      throw new IrekoError(
        `duplicate diagram identifier '${id}'`,
        d.pos,
      );
    }
    // We need to remember that the root might have been anonymous — stash the
    // resolved id back on the diagram so emitter can use it uniformly.
    diagrams.set(id, { ...d, id });
  }

  // 2. Identify the root.
  const roots = [...diagrams.values()].filter((d) => d.isRoot);
  if (roots.length !== 1) {
    throw new IrekoError(
      `internal: expected exactly one root diagram, found ${roots.length}`,
    );
  }
  const rootId = roots[0].id!;

  // 3. Validate every ref target exists and build adjacency.
  const children = new Map<string, string[]>();
  for (const [id, d] of diagrams) {
    const refs = d.body.filter((b): b is RefLine => b.kind === "ref");
    const childIds: string[] = [];
    for (const ref of refs) {
      if (!diagrams.has(ref.target)) {
        throw new IrekoError(
          `undefined ref: no diagram named '${ref.target}'`,
          ref.pos,
        );
      }
      if (ref.target === id) {
        throw new IrekoError(
          `diagram '${id}' references itself`,
          ref.pos,
        );
      }
      childIds.push(ref.target);
    }
    children.set(id, childIds);
  }

  // 4. Detect cycles via DFS.
  detectCycles(rootId, children, diagrams);
  // Also check cycles reachable through non-root nodes (disconnected components).
  const visited = new Set<string>();
  for (const id of diagrams.keys()) {
    if (!visited.has(id)) {
      detectCyclesFrom(id, children, diagrams, visited, new Set());
    }
  }

  // 5. Reachability warnings.
  const reachable = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const n = stack.pop()!;
    if (reachable.has(n)) continue;
    reachable.add(n);
    for (const c of children.get(n) ?? []) stack.push(c);
  }
  const warnings: string[] = [];
  for (const id of diagrams.keys()) {
    if (!reachable.has(id)) {
      const d = diagrams.get(id)!;
      warnings.push(
        `diagram '${id}' ("${d.title}") is defined but never referenced from the root`,
      );
    }
  }

  return { rootId, diagrams, children, warnings };
}

function detectCycles(
  start: string,
  children: Map<string, string[]>,
  diagrams: Map<string, Diagram>,
): void {
  detectCyclesFrom(start, children, diagrams, new Set(), new Set());
}

function detectCyclesFrom(
  node: string,
  children: Map<string, string[]>,
  diagrams: Map<string, Diagram>,
  globalVisited: Set<string>,
  pathStack: Set<string>,
  path: string[] = [],
): void {
  if (pathStack.has(node)) {
    const cycleStart = path.indexOf(node);
    const cycle = path.slice(cycleStart).concat(node).join(" -> ");
    const d = diagrams.get(node);
    throw new IrekoError(`cycle detected: ${cycle}`, d?.pos ?? null);
  }
  if (globalVisited.has(node)) return;
  globalVisited.add(node);
  pathStack.add(node);
  path.push(node);
  for (const child of children.get(node) ?? []) {
    detectCyclesFrom(child, children, diagrams, globalVisited, pathStack, path);
  }
  path.pop();
  pathStack.delete(node);
}
