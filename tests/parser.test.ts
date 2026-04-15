import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { IrekoError } from "../src/errors.js";

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, "..", "examples", name), "utf8");

describe("parser", () => {
  it("parses the OIDC example", () => {
    const file = parse(fixture("oidc.ireko"));
    expect(file.diagrams).toHaveLength(2);
    const root = file.diagrams.find((d) => d.isRoot)!;
    expect(root.id).toBeNull();
    expect(root.title).toBe("OIDC Login Flow");
    const child = file.diagrams.find((d) => d.id === "TokenExchange")!;
    expect(child.title).toBe("Token Exchange");
  });

  it("collects ref and raw body lines in order", () => {
    const src = `@root
diagram "T" {
  sequenceDiagram
    Alice->>Bob: hello
    ref Sub
    Bob->>Alice: bye
}

diagram Sub "Sub" {
  sequenceDiagram
    X->>Y: hi
}
`;
    const file = parse(src);
    const root = file.diagrams.find((d) => d.isRoot)!;
    const kinds = root.body.map((b) => b.kind);
    expect(kinds).toContain("ref");
    expect(kinds).toContain("raw");
    const refIdx = root.body.findIndex((b) => b.kind === "ref");
    expect((root.body[refIdx] as { target: string }).target).toBe("Sub");
    // Order preserved
    const beforeRef = root.body.slice(0, refIdx).map((b) => (b.kind === "raw" ? b.text : ""));
    expect(beforeRef.some((t) => t.includes("Alice->>Bob"))).toBe(true);
    const afterRef = root.body.slice(refIdx + 1).map((b) => (b.kind === "raw" ? b.text : ""));
    expect(afterRef.some((t) => t.includes("Bob->>Alice"))).toBe(true);
  });

  it("requires exactly one @root", () => {
    expect(() => parse('diagram A "T" {\n  x\n}\n')).toThrow(/no root diagram/);
    expect(() =>
      parse(
        `@root\ndiagram "A" {\n  x\n}\n@root\ndiagram B "B" {\n  x\n}\n`,
      ),
    ).toThrow(/more than one diagram is marked '@root'/);
  });

  it("requires identifier on non-root diagrams", () => {
    const src = `@root
diagram "A" {
  x
}

diagram "B" {
  y
}
`;
    expect(() => parse(src)).toThrow(IrekoError);
  });

  it("allows the root diagram to have an identifier", () => {
    const src = `@root
diagram Root "Root" {
  x
}
`;
    const file = parse(src);
    const root = file.diagrams[0];
    expect(root.id).toBe("Root");
    expect(root.isRoot).toBe(true);
  });

  it("rejects empty diagram bodies", () => {
    expect(() => parse('@root\ndiagram "T" {\n}\n')).toThrow(/empty body/);
  });

  it("rejects '@root' with no following diagram", () => {
    expect(() => parse("@root\n")).toThrow(/not followed by a diagram/);
  });

  it("records source positions on diagrams and refs", () => {
    const src = `@root
diagram "A" {
  ref Sub
}

diagram Sub "Sub" {
  x
}
`;
    const file = parse(src);
    const root = file.diagrams.find((d) => d.isRoot)!;
    expect(root.pos.line).toBe(2);
    const ref = root.body.find((b) => b.kind === "ref")!;
    expect(ref.pos.line).toBe(3);
  });
});
