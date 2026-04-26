# Changelog

All notable changes to `ireko` will be documented here.

## [0.1.0] — initial release

### Added

- **Lexer** — hand-written line-oriented lexer with two modes (header and
  body). Handles nested braces in class/state diagrams and ER cardinality
  markers.
- **Parser** — recursive-descent parser producing a typed AST. Enforces
  exactly one `@root`; non-root diagrams must have an identifier.
- **Linker** — resolves `ref` targets, detects undefined refs, self-
  references, cycles, and duplicate ids. Warns on unreachable diagrams.
- **Emitter** — translates `ref` lines to Mermaid substitutions per host
  diagram type (sequenceDiagram, flowchart, stateDiagram-v2, fallback).
  Injects zero-width markers used by the viewer for click binding.
- **CLI** — `ireko build <in> -o <out>` writes a self-contained static
  site (diagrams.json + index.html with data + assets inlined).
- **Viewer** — vanilla JS shell that loads Mermaid, renders the current
  diagram per URL hash, post-processes the SVG to make `ref` placeholders
  clickable, and maintains breadcrumb state.
- **Examples** — `examples/oidc.ireko`, `examples/login-consolidation.ireko`.
- **Tests** — vitest coverage of lexer, parser, linker, emitter, and
  end-to-end build.
- **Licensing** — MIT license + third-party attribution for Mermaid.
