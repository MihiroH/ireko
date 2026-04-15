import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { emit, type DiagramsOutput } from "./emitter.js";
import { link } from "./linker.js";
import { parse } from "./parser.js";

export interface BuildResult {
  /** Emitted diagram data (also written to out/diagrams.json). */
  data: DiagramsOutput;
  /** Non-fatal warnings surfaced by the linker. */
  warnings: string[];
  /** Absolute paths of files written. */
  written: string[];
}

/**
 * End-to-end: read source, parse, link, emit, write a self-contained static
 * site to `outDir`.
 */
export function build(sourcePath: string, outDir: string): BuildResult {
  const source = readFileSync(sourcePath, "utf8");
  const file = parse(source);
  const linked = link(file);
  const data = emit(linked);

  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];

  const jsonText = JSON.stringify(data, null, 2) + "\n";
  const jsonPath = join(outDir, "diagrams.json");
  writeFileSync(jsonPath, jsonText, "utf8");
  written.push(jsonPath);

  // Load viewer assets from the package. At runtime this file lives in
  // dist/, so the viewer is a sibling `viewer/` directory (we ship
  // `src/viewer/` verbatim).
  const assets = locateViewerAssets();
  const appJs = readFileSync(join(assets, "app.js"), "utf8");
  const styleCss = readFileSync(join(assets, "style.css"), "utf8");
  const templateHtml = readFileSync(join(assets, "index.html"), "utf8");

  // Inline diagrams.json into index.html so the viewer works from file://
  // (where fetch() is typically blocked). JSON is embedded in a JSON-typed
  // script tag and parsed by the viewer — this avoids any need to escape
  // JS-specific sequences beyond `</`.
  const safeJson = jsonText.replace(/<\/script/gi, "<\\/script");
  const dataScript =
    `<script id="ireko-data" type="application/json">${safeJson}</script>`;
  const inlinedCss = `<style data-ireko-inline>${styleCss}</style>`;
  const inlinedApp = `<script data-ireko-inline>${appJs}</script>`;

  const html = templateHtml
    .replace(
      /<link rel="stylesheet" href="style\.css"[^>]*\/?>/,
      inlinedCss,
    )
    .replace(
      /<script src="app\.js"[^>]*><\/script>/,
      `${dataScript}\n    ${inlinedApp}`,
    );

  const htmlPath = join(outDir, "index.html");
  writeFileSync(htmlPath, html, "utf8");
  written.push(htmlPath);

  // Also write the un-inlined assets so users can host from a web server
  // or customize without rebuilding.
  writeFileSync(join(outDir, "app.js"), appJs, "utf8");
  written.push(join(outDir, "app.js"));
  writeFileSync(join(outDir, "style.css"), styleCss, "utf8");
  written.push(join(outDir, "style.css"));

  return { data, warnings: linked.warnings, written };
}

/**
 * Locate bundled viewer assets. We search a short list of candidate paths so
 * `build` works both during development (running from repo root) and when
 * installed as a published package.
 */
function locateViewerAssets(): string {
  const thisFile = typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url);
  const here = dirname(thisFile);
  const candidates = [
    resolve(here, "..", "src", "viewer"),   // published package: dist/ → ../src/viewer
    resolve(here, "..", "..", "src", "viewer"), // nested build layouts
    resolve(here, "viewer"),                // when running tests against src/
    resolve(process.cwd(), "src", "viewer"),
  ];
  for (const c of candidates) {
    try {
      // Check for index.html as a sentinel.
      readFileSync(join(c, "index.html"));
      return c;
    } catch {
      // continue
    }
  }
  throw new Error(
    `could not locate ireko viewer assets (searched: ${candidates.join(", ")})`,
  );
}
