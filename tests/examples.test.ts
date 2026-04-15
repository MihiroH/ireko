/**
 * @vitest-environment jsdom
 *
 * End-to-end check: every .ireko in examples/ must build AND its emitted
 * Mermaid must parse under a real Mermaid runtime. This catches syntax the
 * emitter might produce which is valid ireko but broken Mermaid (unbalanced
 * brackets, forbidden characters in notes, etc.).
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import mermaid from "mermaid";
import { build } from "../src/build.js";

const EXAMPLES_DIR = resolve(__dirname, "..", "examples");

beforeAll(() => {
  mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
});

const exampleFiles = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".ireko"));

describe("examples", () => {
  it.each(exampleFiles)("%s builds and emits valid Mermaid", async (file) => {
    const src = resolve(EXAMPLES_DIR, file);
    const tmp = resolve(__dirname, "..", ".tmp-examples", file.replace(/\W+/g, "_"));
    const result = build(src, tmp);
    expect(result.data.root).toBeTruthy();

    for (const [id, diagram] of Object.entries(result.data.diagrams)) {
      await expect(
        mermaid.parse(diagram.mermaid),
        `Mermaid rejected diagram '${id}' from ${file}:\n${diagram.mermaid}`,
      ).resolves.toBeTruthy();
    }
  });
});
