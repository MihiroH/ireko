import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { build } from "../src/build.js";

describe("build", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ireko-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("produces a self-contained static site from the OIDC example", () => {
    const source = resolve(__dirname, "..", "examples", "oidc.ireko");
    const result = build(source, tmp);

    for (const file of ["diagrams.json", "index.html", "app.js", "style.css"]) {
      expect(existsSync(join(tmp, file))).toBe(true);
    }

    const data = JSON.parse(readFileSync(join(tmp, "diagrams.json"), "utf8"));
    expect(Object.keys(data.diagrams)).toContain(data.root);
    expect(Object.keys(data.diagrams)).toContain("TokenExchange");

    // index.html inlines the data so file:// viewing works.
    const html = readFileSync(join(tmp, "index.html"), "utf8");
    expect(html).toContain('id="ireko-data"');
    expect(html).toContain("TokenExchange");
    // App JS is inlined too so no same-origin fetch is needed.
    expect(html).toContain("data-ireko-inline");
    expect(html).toMatch(/IREKO|ireko:/); // marker handling from app.js

    // No warnings on the canonical example.
    expect(result.warnings).toEqual([]);
    expect(result.data.root).toBe(result.data.root);
  });

  it("surfaces warnings for unused diagrams", () => {
    const src = `@root
diagram "Root" {
  sequenceDiagram
    participant A
    A->>A: hi
}

diagram Orphan "Not linked" {
  sequenceDiagram
    participant B
    B->>B: x
}
`;
    const inDir = mkdtempSync(join(tmpdir(), "ireko-src-"));
    const inPath = join(inDir, "in.ireko");
    writeFileSync(inPath, src, "utf8");
    try {
      const result = build(inPath, tmp);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toMatch(/Orphan/);
    } finally {
      rmSync(inDir, { recursive: true, force: true });
    }
  });
});
