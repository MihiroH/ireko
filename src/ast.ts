/**
 * AST node types for ireko source files.
 *
 * The parser produces a shallow tree: a {@link File} containing one or more
 * {@link Diagram} nodes. Diagram bodies are preserved as a mixed list of
 * opaque raw lines and parsed {@link RefLine} nodes — ireko does not attempt
 * to understand the underlying Mermaid syntax.
 */

export interface Position {
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  col: number;
}

export interface RawLine {
  kind: "raw";
  text: string;
  pos: Position;
}

export interface RefLine {
  kind: "ref";
  /** Identifier of the referenced diagram. */
  target: string;
  /**
   * Optional anchor — an existing element (node, participant, state) in the
   * host diagram to attach the drill-down to, instead of creating a new
   * placeholder.
   *
   * Syntax: `ref Anchor > Target`
   *
   * When null, the emitter creates a standalone placeholder (the default
   * behavior). When set, the emitter binds the click to the named element.
   */
  anchor: string | null;
  pos: Position;
}

export type BodyLine = RawLine | RefLine;

export interface Diagram {
  kind: "diagram";
  /**
   * Diagram identifier. Optional for the root diagram (which may be anonymous),
   * required for every other diagram so it can be referenced.
   */
  id: string | null;
  /** Human-readable title shown in UI. */
  title: string;
  /** Whether this diagram was marked with `@root`. */
  isRoot: boolean;
  /** Body lines, in source order. */
  body: BodyLine[];
  pos: Position;
}

export interface File {
  kind: "file";
  diagrams: Diagram[];
}
