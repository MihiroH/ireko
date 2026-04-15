import type { Position } from "./ast.js";
import { IrekoError } from "./errors.js";

/**
 * Token types produced by the ireko lexer.
 *
 * The lexer operates in two modes: {@link Mode.Header} for the outer syntax
 * (`@root`, `diagram IDENT? STRING {`) and {@link Mode.Body} for diagram
 * bodies. In body mode the lexer emits whole lines as either {@link RefLine}
 * (a line of the form `ref IDENT`) or {@link RawLine} (everything else).
 */
export type TokenKind =
  | "AT_ROOT"
  | "DIAGRAM"
  | "IDENT"
  | "STRING"
  | "LBRACE"
  | "RBRACE"
  | "REF_LINE"
  | "RAW_LINE"
  | "EOF";

export interface Token {
  kind: TokenKind;
  /** Literal text for IDENT / STRING (unquoted), ref target for REF_LINE, full line text for RAW_LINE. */
  value: string;
  pos: Position;
}

enum Mode {
  Header = "header",
  Body = "body",
}

/** Matches identifiers: start with letter or underscore, then letters/digits/underscore. */
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

/** Lex an ireko source string into a token stream. */
export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  let mode: Mode = Mode.Header;
  /** Brace nesting depth inside body. Opening `{` of diagram sets this to 1. */
  let bodyDepth = 0;

  const here = (): Position => ({ line, col });

  const advance = (n = 1): void => {
    for (let k = 0; k < n; k++) {
      if (source[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  const skipHeaderWhitespace = (): void => {
    while (i < source.length) {
      const c = source[i];
      if (c === " " || c === "\t" || c === "\r" || c === "\n") {
        advance();
      } else if (c === "/" && source[i + 1] === "/") {
        // Line comment — skip to end of line
        while (i < source.length && source[i] !== "\n") advance();
      } else {
        break;
      }
    }
  };

  const readIdent = (): Token => {
    const pos = here();
    const rest = source.slice(i);
    const m = IDENT_RE.exec(rest);
    if (!m) {
      throw new IrekoError(`expected identifier, got '${source[i] ?? "<EOF>"}'`, pos);
    }
    advance(m[0].length);
    return { kind: "IDENT", value: m[0], pos };
  };

  const readString = (): Token => {
    const pos = here();
    if (source[i] !== '"') {
      throw new IrekoError(`expected '"' to start string literal`, pos);
    }
    advance(); // opening quote
    let value = "";
    while (i < source.length && source[i] !== '"') {
      if (source[i] === "\n") {
        throw new IrekoError("unterminated string literal", pos);
      }
      if (source[i] === "\\" && i + 1 < source.length) {
        const next = source[i + 1];
        if (next === '"' || next === "\\") {
          value += next;
          advance(2);
          continue;
        }
      }
      value += source[i];
      advance();
    }
    if (i >= source.length) {
      throw new IrekoError("unterminated string literal", pos);
    }
    advance(); // closing quote
    return { kind: "STRING", value, pos };
  };

  /** Read one body line. Assumes `i` is at start of line. Returns token + moves `i`. */
  const readBodyLine = (): Token => {
    const startPos = here();
    const lineStart = i;
    // Find end of line
    let end = i;
    while (end < source.length && source[end] !== "\n") end++;
    const rawLine = source.slice(lineStart, end);

    // Check if this line is only the closing brace (possibly with trailing
    // whitespace) AND bodyDepth would fall to 0 after it. That case is
    // detected by the caller; here we just classify.
    //
    // Check for `ref IDENT` (leading whitespace allowed, nothing else allowed).
    const refMatch = /^\s*ref\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(rawLine);
    if (refMatch) {
      advance(end - i); // consume the line content
      if (source[i] === "\n") advance();
      // Column where `ref` starts — useful for error messages
      const indent = /^\s*/.exec(rawLine)![0].length;
      return {
        kind: "REF_LINE",
        value: refMatch[1],
        pos: { line: startPos.line, col: startPos.col + indent },
      };
    }

    advance(end - i);
    if (source[i] === "\n") advance();
    return { kind: "RAW_LINE", value: rawLine, pos: startPos };
  };

  /**
   * Count unescaped `{` and `}` in a raw line, respecting double-quoted
   * strings and `%%` line comments. Used to track nested brace depth in
   * diagram bodies (e.g., Mermaid class diagrams).
   *
   * ER diagram cardinality markers (`||--o{`, `}o--||`, etc.) are stripped
   * before counting — their curly braces are syntactic noise, not blocks.
   */
  const countBraces = (text: string): { open: number; close: number } => {
    let open = 0;
    let close = 0;
    let inStr = false;
    // Strip ER-style cardinality symbols: one or two chars from the set
    // `|o{}`, followed by `--`, followed by another one or two such chars.
    const stripped = text.replace(/[|o{}]{1,2}--[|o{}]{1,2}/g, "");
    for (let k = 0; k < stripped.length; k++) {
      const c = stripped[k];
      if (inStr) {
        if (c === "\\" && k + 1 < stripped.length) {
          k++;
          continue;
        }
        if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') {
        inStr = true;
      } else if (c === "%" && stripped[k + 1] === "%") {
        break; // rest of line is a comment
      } else if (c === "{") {
        open++;
      } else if (c === "}") {
        close++;
      }
    }
    return { open, close };
  };

  while (i < source.length) {
    if (mode === Mode.Header) {
      skipHeaderWhitespace();
      if (i >= source.length) break;

      const pos = here();
      const c = source[i];

      if (c === "@") {
        // @root annotation
        const rest = source.slice(i);
        if (rest.startsWith("@root") && !/[A-Za-z0-9_]/.test(rest[5] ?? "")) {
          advance("@root".length);
          tokens.push({ kind: "AT_ROOT", value: "@root", pos });
          continue;
        }
        throw new IrekoError(`unknown annotation: ${rest.slice(0, 10)}...`, pos);
      }

      if (c === '"') {
        tokens.push(readString());
        continue;
      }

      if (c === "{") {
        advance();
        tokens.push({ kind: "LBRACE", value: "{", pos });
        mode = Mode.Body;
        bodyDepth = 1;
        // Skip to end of the header line so body starts on the next line.
        while (i < source.length && source[i] !== "\n") {
          if (source[i] !== " " && source[i] !== "\t" && source[i] !== "\r") {
            throw new IrekoError(
              `unexpected '${source[i]}' after '{'; diagram body must start on a new line`,
              here(),
            );
          }
          advance();
        }
        if (source[i] === "\n") advance();
        continue;
      }

      if (c === "}") {
        throw new IrekoError("unexpected '}' outside diagram body", pos);
      }

      if (IDENT_RE.test(source.slice(i))) {
        const tok = readIdent();
        if (tok.value === "diagram") {
          tokens.push({ ...tok, kind: "DIAGRAM" });
        } else {
          tokens.push(tok);
        }
        continue;
      }

      throw new IrekoError(`unexpected character '${c}'`, pos);
    }

    // Body mode
    const tok = readBodyLine();

    if (tok.kind === "RAW_LINE") {
      const { open, close } = countBraces(tok.value);
      bodyDepth += open - close;

      if (bodyDepth <= 0) {
        // This line contains the closing `}` of the diagram. Find where it is
        // (the last unescaped `}` that brings depth to 0) and split.
        const splitIdx = findDiagramCloseIndex(tok.value);
        if (splitIdx < 0) {
          throw new IrekoError("unbalanced braces in diagram body", tok.pos);
        }
        const before = tok.value.slice(0, splitIdx);
        if (before.trim().length > 0) {
          tokens.push({ kind: "RAW_LINE", value: before, pos: tok.pos });
        }
        tokens.push({
          kind: "RBRACE",
          value: "}",
          pos: { line: tok.pos.line, col: tok.pos.col + splitIdx },
        });
        mode = Mode.Header;
        bodyDepth = 0;
        continue;
      }
      tokens.push(tok);
    } else {
      // REF_LINE — no braces to count
      tokens.push(tok);
    }
  }

  tokens.push({ kind: "EOF", value: "", pos: here() });
  return tokens;
}

/**
 * Given a line where brace counting determined the diagram closes, return
 * the column index of the `}` that closes the outermost diagram body.
 *
 * We scan right-to-left for the last unescaped `}` not inside a string or
 * after `%%`. For simplicity we assume the closing brace is not inside a
 * string — in practice it sits on its own line.
 */
function findDiagramCloseIndex(line: string): number {
  let inStr = false;
  let commentStart = -1;
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (inStr) {
      if (c === "\\" && k + 1 < line.length) {
        k++;
        continue;
      }
      if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === "%" && line[k + 1] === "%") {
      commentStart = k;
      break;
    }
  }
  const scanEnd = commentStart >= 0 ? commentStart : line.length;
  // Find last `}` in the non-comment, non-string prefix
  inStr = false;
  let lastClose = -1;
  for (let k = 0; k < scanEnd; k++) {
    const c = line[k];
    if (inStr) {
      if (c === "\\" && k + 1 < scanEnd) {
        k++;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
    } else if (c === "}") {
      lastClose = k;
    }
  }
  return lastClose;
}
