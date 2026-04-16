import { describe, expect, it } from "vitest";
import { lex } from "../src/lexer.js";
import { IrekoError } from "../src/errors.js";

describe("lexer", () => {
  it("tokenizes @root annotation", () => {
    const toks = lex('@root\ndiagram "Hi" {\nsequenceDiagram\n}\n');
    expect(toks.map((t) => t.kind)).toEqual([
      "AT_ROOT",
      "DIAGRAM",
      "STRING",
      "LBRACE",
      "RAW_LINE",
      "RBRACE",
      "EOF",
    ]);
  });

  it("parses diagram with identifier and title", () => {
    const toks = lex('diagram Foo "Title" {\n  hi\n}\n');
    expect(toks[0]).toMatchObject({ kind: "DIAGRAM", value: "diagram" });
    expect(toks[1]).toMatchObject({ kind: "IDENT", value: "Foo" });
    expect(toks[2]).toMatchObject({ kind: "STRING", value: "Title" });
  });

  it("recognizes ref lines inside bodies", () => {
    const src = 'diagram A "T" {\n  line one\n  ref Foo\n  line two\n}\n';
    const toks = lex(src);
    const kinds = toks.map((t) => t.kind);
    expect(kinds).toContain("REF_LINE");
    const ref = toks.find((t) => t.kind === "REF_LINE")!;
    expect(ref.value).toBe("Foo");
  });

  it("treats lines that only contain ref as ref tokens, other lines as raw", () => {
    const src = 'diagram A "T" {\n  Browser->>Server: ref this\n  ref Foo\n}\n';
    const toks = lex(src);
    const refs = toks.filter((t) => t.kind === "REF_LINE");
    const raws = toks.filter((t) => t.kind === "RAW_LINE");
    expect(refs).toHaveLength(1);
    expect(refs[0].value).toBe("Foo");
    expect(raws.some((r) => r.value.includes("Browser->>Server"))).toBe(true);
  });

  it("handles nested braces in body (e.g., class diagrams)", () => {
    const src = `diagram C "Classes" {
  classDiagram
    class Order {
      +String id
    }
    class User {
      +Order order
    }
}
`;
    const toks = lex(src);
    // Should end with exactly one RBRACE matching the outer diagram
    const rbraces = toks.filter((t) => t.kind === "RBRACE");
    expect(rbraces).toHaveLength(1);
    // The inner braces should appear within RAW_LINE tokens
    const raws = toks
      .filter((t) => t.kind === "RAW_LINE")
      .map((t) => t.value)
      .join("\n");
    expect(raws).toContain("class Order {");
    expect(raws).toContain("class User {");
  });

  it("handles strings with quoted braces in titles", () => {
    const toks = lex('diagram Foo "has { brace" {\n  x\n}\n');
    const s = toks.find((t) => t.kind === "STRING")!;
    expect(s.value).toBe("has { brace");
  });

  it("supports escaped quotes in strings", () => {
    const toks = lex('diagram "He said \\"hi\\"" {\n  x\n}\n');
    const s = toks.find((t) => t.kind === "STRING")!;
    expect(s.value).toBe('He said "hi"');
  });

  it("reports unterminated strings with position", () => {
    expect(() => lex('diagram "unterminated\n{\n}\n')).toThrow(IrekoError);
  });

  it("tracks line/col for identifiers", () => {
    const toks = lex('\n  diagram Foo "T" {\n  x\n}\n');
    const diag = toks.find((t) => t.kind === "DIAGRAM")!;
    expect(diag.pos).toEqual({ line: 2, col: 3 });
  });

  it("allows `//` line comments at the header level", () => {
    const toks = lex('// comment\n@root\ndiagram "T" {\n  x\n}\n');
    // The `// comment` should be skipped entirely
    expect(toks[0].kind).toBe("AT_ROOT");
  });

  it("recognizes anchored ref lines (ref Anchor > Target)", () => {
    const src = 'diagram A "T" {\n  ref Day1 > Sub\n}\n';
    const toks = lex(src);
    const ref = toks.find((t) => t.kind === "REF_LINE")!;
    expect(ref).toBeDefined();
    expect(ref.value).toBe("Day1>Sub");
  });

  it("does not treat 'ref X > Y' with extra text as a ref", () => {
    const src = 'diagram A "T" {\n  ref X > Y extra\n}\n';
    const toks = lex(src);
    // Should be a raw line, not a ref
    const ref = toks.find((t) => t.kind === "REF_LINE");
    expect(ref).toBeUndefined();
  });

  it("errors on content after '{' on the same line as header", () => {
    expect(() => lex('diagram "T" { stuff\n}\n')).toThrow(IrekoError);
  });
});
