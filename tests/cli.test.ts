import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..");
const CLI = join(REPO_ROOT, "dist", "cli.cjs");
const EXAMPLE = join(REPO_ROOT, "examples", "oidc.ireko");

/**
 * These tests spawn the built CLI. They require `pnpm build` to have run
 * first (CI does this explicitly; the `beforeAll` below guards local runs).
 */
function run(args: string[], opts: { cwd?: string } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: "utf8",
  });
}

describe("cli", () => {
  let tmp: string;

  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error(
        `CLI binary not found at ${CLI}. Run 'pnpm build' before 'pnpm test'.`,
      );
    }
  });

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ireko-cli-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("prints usage with no args and exits 0", () => {
    const r = run([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage:/);
  });

  it("--help prints usage", () => {
    const r = run(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/ireko — nested diagrams/);
  });

  it("--version prints the package version", () => {
    const r = run(["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^ireko \d+\.\d+\.\d+$/);
  });

  it("rejects unknown flags with exit code 2", () => {
    const r = run(["build", EXAMPLE, "--no-such-flag"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Unknown option/i);
  });

  it("reports undefined refs with file:line:col and exits 1", () => {
    const badPath = join(tmp, "bad.ireko");
    writeFileSync(
      badPath,
      `@root
diagram "Top" {
  sequenceDiagram
    A->>B: hi
    ref Missing
}
`,
    );
    const out = join(tmp, "out");
    const r = run(["build", badPath, "-o", out]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/bad\.ireko:5:5: error: undefined ref/);
    expect(existsSync(join(out, "index.html"))).toBe(false);
  });

  it("builds a site with -o", () => {
    const out = join(tmp, "site");
    const r = run(["build", EXAMPLE, "-o", out]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/wrote .* file\(s\)/);
    expect(existsSync(join(out, "index.html"))).toBe(true);
    expect(existsSync(join(out, "diagrams.json"))).toBe(true);
    // Inlined data present
    const html = readFileSync(join(out, "index.html"), "utf8");
    expect(html).toContain('id="ireko-data"');
  });

  it("accepts --out=DIR and -oDIR forms", () => {
    const a = join(tmp, "a");
    const b = join(tmp, "b");
    expect(run(["build", EXAMPLE, `--out=${a}`]).status).toBe(0);
    expect(run(["build", EXAMPLE, `-o${b}`]).status).toBe(0);
    expect(existsSync(join(a, "index.html"))).toBe(true);
    expect(existsSync(join(b, "index.html"))).toBe(true);
  });

  it("emits warnings for unreachable diagrams on stderr", () => {
    const src = join(tmp, "orphans.ireko");
    writeFileSync(
      src,
      `@root
diagram "Root" {
  sequenceDiagram
    A->>A: x
}

diagram Orphan "Orphan" {
  sequenceDiagram
    B->>B: y
}
`,
    );
    const r = run(["build", src, "-o", join(tmp, "out")]);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/warning:.*Orphan.*never referenced/);
  });

  // Suppress the "no tests" warning when this describe is the only one.
  afterAll(() => { /* noop */ });
});
