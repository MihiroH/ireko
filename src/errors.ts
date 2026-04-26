import type { Position } from "./ast.js";

/**
 * Error raised when ireko source fails to lex, parse, or link.
 *
 * The {@link pos} field points at the offending line/col so the CLI can
 * print a helpful caret. Messages are plain strings — no formatting codes.
 */
export class IrekoError extends Error {
  readonly pos: Position | null;

  constructor(message: string, pos: Position | null = null) {
    super(message);
    this.name = "IrekoError";
    this.pos = pos;
  }
}

/** Formats an error with `file:line:col: message`, suitable for stderr. */
export function formatError(err: IrekoError, sourcePath = "<input>"): string {
  if (err.pos) {
    return `${sourcePath}:${err.pos.line}:${err.pos.col}: error: ${err.message}`;
  }
  return `${sourcePath}: error: ${err.message}`;
}
