import type { BodyLine, Diagram, File, Position } from "./ast.js";
import { IrekoError } from "./errors.js";
import { lex, type Token } from "./lexer.js";

/**
 * Parses an ireko source string into an AST.
 *
 * Grammar (informal):
 *
 * ```
 * file        := (annotation | diagram)*
 * annotation  := "@root"              # applies to the next diagram
 * diagram     := "diagram" IDENT? STRING "{" body "}"
 * body        := (raw_line | ref_line)*
 * ```
 *
 * Exactly one diagram must be marked `@root`. The root diagram may omit its
 * identifier; every other diagram must have one.
 */
export function parse(source: string): File {
  const tokens = lex(source);
  const parser = new Parser(tokens);
  return parser.parseFile();
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  private expect(kind: Token["kind"], what?: string): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      throw new IrekoError(
        `expected ${what ?? kind}, got ${t.kind}${t.value ? ` ('${t.value}')` : ""}`,
        t.pos,
      );
    }
    return this.advance();
  }

  parseFile(): File {
    const diagrams: Diagram[] = [];
    let pendingRoot = false;
    let rootPos: Position | null = null;

    while (this.peek().kind !== "EOF") {
      const t = this.peek();
      if (t.kind === "AT_ROOT") {
        if (pendingRoot) {
          throw new IrekoError("duplicate '@root' annotation", t.pos);
        }
        pendingRoot = true;
        rootPos = t.pos;
        this.advance();
        continue;
      }
      if (t.kind === "DIAGRAM") {
        const diagram = this.parseDiagram(pendingRoot);
        diagrams.push(diagram);
        pendingRoot = false;
        rootPos = null;
        continue;
      }
      throw new IrekoError(
        `expected 'diagram' or '@root', got ${t.kind}${t.value ? ` ('${t.value}')` : ""}`,
        t.pos,
      );
    }

    if (pendingRoot) {
      throw new IrekoError("'@root' annotation is not followed by a diagram", rootPos);
    }

    const rootCount = diagrams.filter((d) => d.isRoot).length;
    if (rootCount === 0) {
      throw new IrekoError(
        "no root diagram: exactly one diagram must be marked with '@root'",
      );
    }
    if (rootCount > 1) {
      const second = diagrams.filter((d) => d.isRoot)[1];
      throw new IrekoError("more than one diagram is marked '@root'", second.pos);
    }

    return { kind: "file", diagrams };
  }

  private parseDiagram(isRoot: boolean): Diagram {
    const header = this.expect("DIAGRAM", "'diagram'");
    let id: string | null = null;
    let title: string;

    const next = this.peek();
    if (next.kind === "IDENT") {
      id = this.advance().value;
      title = this.expect("STRING", "diagram title string").value;
    } else if (next.kind === "STRING") {
      title = this.advance().value;
    } else {
      throw new IrekoError(
        `expected identifier or title string after 'diagram', got ${next.kind}`,
        next.pos,
      );
    }

    if (!isRoot && id === null) {
      throw new IrekoError(
        "only the root diagram may omit its identifier; non-root diagrams need 'diagram IDENT \"Title\"'",
        header.pos,
      );
    }

    this.expect("LBRACE", "'{'");

    const body: BodyLine[] = [];
    while (this.peek().kind !== "RBRACE" && this.peek().kind !== "EOF") {
      const t = this.advance();
      if (t.kind === "RAW_LINE") {
        body.push({ kind: "raw", text: t.value, pos: t.pos });
      } else if (t.kind === "REF_LINE") {
        // Lexer encodes anchored refs as "anchor>target", standalone as "target".
        const gtIdx = t.value.indexOf(">");
        if (gtIdx >= 0) {
          body.push({
            kind: "ref",
            anchor: t.value.slice(0, gtIdx),
            target: t.value.slice(gtIdx + 1),
            pos: t.pos,
          });
        } else {
          body.push({ kind: "ref", anchor: null, target: t.value, pos: t.pos });
        }
      } else {
        throw new IrekoError(`unexpected token in diagram body: ${t.kind}`, t.pos);
      }
    }

    this.expect("RBRACE", "'}'");

    if (body.length === 0 || body.every((b) => b.kind === "raw" && b.text.trim() === "")) {
      throw new IrekoError(
        `diagram ${id ? `'${id}'` : `"${title}"`} has an empty body`,
        header.pos,
      );
    }

    return {
      kind: "diagram",
      id,
      title,
      isRoot,
      body,
      pos: header.pos,
    };
  }
}
