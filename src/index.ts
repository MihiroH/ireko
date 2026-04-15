export { lex, type Token, type TokenKind } from "./lexer.js";
export { parse } from "./parser.js";
export {
  link,
  type LinkedProgram,
  SYNTHETIC_ROOT_ID,
} from "./linker.js";
export {
  emit,
  type DiagramsOutput,
  type EmittedDiagram,
  IREKO_MARKER_OPEN,
  IREKO_MARKER_CLOSE,
  IREKO_MARKER_REGEX,
} from "./emitter.js";
export type {
  File,
  Diagram,
  BodyLine,
  RawLine,
  RefLine,
  Position,
} from "./ast.js";
export { IrekoError, formatError } from "./errors.js";
export { build, type BuildResult } from "./build.js";
