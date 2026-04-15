import { describe, expect, it } from "vitest";
import type { LinkedProgram } from "../src/linker.js";
import { parse } from "../src/parser.js";
import { link, SYNTHETIC_ROOT_ID } from "../src/linker.js";

const p = (src: string) => link(parse(src));

const childrenOf = (prog: LinkedProgram, id: string): string[] => {
  const d = prog.diagrams.get(id);
  if (!d) return [];
  return d.body.flatMap((b) => (b.kind === "ref" ? [b.target] : []));
};

describe("linker", () => {
  it("links a well-formed program", () => {
    const prog = p(`@root
diagram "A" {
  sequenceDiagram
    ref Sub
}

diagram Sub "Sub" {
  sequenceDiagram
    X->>Y: hi
}
`);
    expect(prog.rootId).toBe(SYNTHETIC_ROOT_ID);
    expect(prog.diagrams.has("Sub")).toBe(true);
    expect(childrenOf(prog, SYNTHETIC_ROOT_ID)).toEqual(["Sub"]);
    expect(childrenOf(prog, "Sub")).toEqual([]);
    expect(prog.warnings).toEqual([]);
  });

  it("uses the author-supplied root id when given", () => {
    const prog = p(`@root
diagram Main "M" {
  sequenceDiagram
    ref Sub
}
diagram Sub "S" {
  sequenceDiagram
    x
}
`);
    expect(prog.rootId).toBe("Main");
  });

  it("errors on undefined ref", () => {
    expect(() =>
      p(`@root
diagram "A" {
  sequenceDiagram
    ref Missing
}
`),
    ).toThrow(/undefined ref.*Missing/);
  });

  it("errors on duplicate diagram ids", () => {
    expect(() =>
      p(`@root
diagram Foo "A" {
  sequenceDiagram
    x
}
diagram Foo "B" {
  sequenceDiagram
    y
}
`),
    ).toThrow(/duplicate diagram identifier 'Foo'/);
  });

  it("detects self-reference", () => {
    expect(() =>
      p(`@root
diagram Root "A" {
  sequenceDiagram
    ref Sub
}
diagram Sub "Sub" {
  sequenceDiagram
    ref Sub
}
`),
    ).toThrow(/references itself/);
  });

  it("detects cycles", () => {
    expect(() =>
      p(`@root
diagram Root "Root" {
  sequenceDiagram
    ref A
}
diagram A "A" {
  sequenceDiagram
    ref B
}
diagram B "B" {
  sequenceDiagram
    ref A
}
`),
    ).toThrow(/cycle detected/);
  });

  it("warns on unused diagrams", () => {
    const prog = p(`@root
diagram "Root" {
  sequenceDiagram
    x
}
diagram Orphan "Not linked" {
  sequenceDiagram
    y
}
`);
    expect(prog.warnings).toHaveLength(1);
    expect(prog.warnings[0]).toMatch(/Orphan.*never referenced/);
  });

  it("allows multiple refs to the same sub-diagram", () => {
    const prog = p(`@root
diagram "Root" {
  sequenceDiagram
    ref Sub
    x
    ref Sub
}
diagram Sub "S" {
  sequenceDiagram
    y
}
`);
    expect(childrenOf(prog, prog.rootId)).toEqual(["Sub", "Sub"]);
    expect(prog.warnings).toEqual([]);
  });

  it("detects direct cycle between two diagrams", () => {
    expect(() =>
      p(`@root
diagram Root "R" {
  sequenceDiagram
    ref A
}
diagram A "A" {
  sequenceDiagram
    ref Root
}
`),
    ).toThrow(/cycle detected/);
  });
});
