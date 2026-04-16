# ireko

> Nested diagrams as code — Mermaid, with drill-down.
>
> *入れ子 (ireko): Japanese for nested objects, like matryoshka dolls.*

`ireko` wraps Mermaid with a tiny syntax for **sub-diagrams**. Any step in
your diagram can be a `ref` to another diagram, which becomes a clickable
drill-down in the rendered output. One file, a tree of diagrams, breadcrumb
navigation between levels.

**Status: early development (v0.1).**  API and syntax may change.

## Why

A single flat sequence diagram for a real flow (auth, distributed transactions,
request lifecycles) is either too sparse to be useful or too dense to read.
`ireko` lets you write the overview and the details separately, and link them.

|Tool|Drill-down?|
|---|---|
|Mermaid|❌ (`click` only opens URLs)|
|PlantUML|partial (`ref over` is opaque)|
|IcePanel / Structurizr|architecture-only|
|`ireko`|✅ any Mermaid diagram, any level|

## Install

```sh
pnpm add -D ireko
# or
npm i -D ireko
```

Requires Node.js ≥ 22. (Node 20 reached end-of-life on 2026-04-30.)

## Quick start

Create `flow.ireko`:

```text
@root
diagram "OIDC Login Flow" {
  sequenceDiagram
    participant User
    participant Browser
    participant AuthServer

    User->>Browser: Click login
    Browser->>AuthServer: GET /authorize
    AuthServer->>Browser: Redirect with code
    ref TokenExchange
    Browser->>User: Logged in
}

diagram TokenExchange "Token Exchange" {
  sequenceDiagram
    participant Browser
    participant AuthServer
    participant TokenEndpoint

    Browser->>AuthServer: POST /token (code)
    AuthServer->>TokenEndpoint: Validate code
    TokenEndpoint->>AuthServer: Issue JWT
    AuthServer->>Browser: Set session cookie
}
```

Build it:

```sh
npx ireko build flow.ireko -o out/
```

Open `out/index.html` in a browser — it works directly from `file://` because
the diagram data is inlined. Alternatively, serve the output directory with a
local HTTP server:

```sh
cd out && python3 -m http.server
# open http://localhost:8000
```

Click the `🔍 Token Exchange` marker to drill in; use the breadcrumb or the
browser back button to return.

## Syntax

A `.ireko` file is a list of `diagram` blocks. Exactly one block is marked
`@root` — the entry point. Inside a block, any line of the form `ref Ident`
becomes a clickable drill-down to another diagram named `Ident`.

```text
@root
diagram "Top level" {
  sequenceDiagram
    ...
    ref SubFlow
    ...
}

diagram SubFlow "Sub flow" {
  sequenceDiagram
    ...
}
```

Grammar:

```
file        := (annotation | diagram)*
annotation  := "@root"                       # applies to the next diagram
diagram     := "diagram" IDENT? STRING "{" body "}"
body        := (raw_line | ref_line)*
ref_line    := whitespace* "ref" IDENT whitespace* newline              # standalone
             | whitespace* "ref" IDENT ">" IDENT whitespace* newline    # anchored
```

Everything inside a diagram body (except `ref` lines) is **opaque** to
`ireko` — it is handed to Mermaid verbatim. This means any Mermaid diagram
type works: sequence, flowchart, state, class, ER, and so on.

### Rules

- The root diagram may omit its identifier: `diagram "Title" { ... }`.
  Non-root diagrams must have one: `diagram Name "Title" { ... }`.
- The opening `{` must end the diagram header line; the body starts on the
  next line.
- Identifiers are `[A-Za-z_][A-Za-z0-9_]*`.
- Strings are double-quoted. Use `\"` to embed a quote, `\\` for a backslash.
- `//` starts a line comment at the file level (outside a diagram body).
- Each `ref` line must have only `ref Ident` or `ref Anchor > Target` on it
  (leading whitespace OK). The anchored form attaches the drill-down to an
  existing element instead of creating a new placeholder.

### What ireko does with `ref` (per diagram type)

**Standalone `ref Target`** — creates a new visual element:

| Host type          | Substitution emitted                                                                 |
| ------------------ | ------------------------------------------------------------------------------------ |
| `sequenceDiagram`  | `Note over <last participant>: 🔍 <title>` with a hidden marker for click binding    |
| `flowchart`/`graph`| A node `__ref_Ident__["🔍 <title>"]` inserted at the line’s position                |
| `stateDiagram-v2`  | A stub state `state "🔍 <title>" as Ident_ref`                                      |
| other              | A `%% ref: Ident` comment (drill-down still works but the marker is not prominent)  |

**Anchored `ref Anchor > Target`** — binds to an existing element:

| Host type          | Substitution emitted                                                                |
| ------------------ | ----------------------------------------------------------------------------------- |
| `flowchart`/`graph`| `click Anchor "#Target"` + a styling class — the existing node becomes a link       |
| `sequenceDiagram`  | `Note over Anchor: 🔍 <title>` — note on the specified participant                 |
| `stateDiagram-v2`  | State stub anchored to the named state                                              |
| other              | A `%% ref: Anchor > Target` comment                                                |

## CLI

```
ireko — nested diagrams

Usage:
  ireko build <input.ireko> [-o|--out <dir>]
  ireko --help
  ireko --version
```

`ireko build` produces a self-contained static site in the output directory:

```
out/
├── index.html       # mermaid loaded from CDN; data inlined for file:// use
├── app.js           # viewer shell (also inlined into index.html)
├── style.css        # same
└── diagrams.json    # the raw emitter output, for tooling / custom viewers
```

The generated `index.html` can be opened directly via `file://` (the data is
inlined, so no server is required). Mermaid is loaded from a pinned CDN URL
(`mermaid@11.14.0`). For a hardened deployment, add an SRI `integrity` hash
(instructions are embedded as a comment in the generated HTML) or vendor
`mermaid.esm.min.mjs` alongside `index.html` and change the URL to a
relative path.

## Errors and warnings

`ireko build` reports compile errors with `file:line:col: error: ...`:

- `undefined ref: no diagram named 'Foo'` — a `ref` target doesn't exist.
- `cycle detected: Root -> A -> B -> A` — diagrams form a loop.
- `duplicate diagram identifier 'X'` — two diagrams share an id.
- `only the root diagram may omit its identifier` — `diagram "Title"` in a non-root slot.

Diagrams that are defined but never reachable from the root emit a
non-fatal warning.

## Programmatic API

```ts
import { parse, link, emit, build } from "ireko";

// Step-by-step
const ast = parse(source);
const program = link(ast);
const output = emit(program);  // { root, diagrams: { ... } }

// Or in one shot (also writes the static site)
const result = build("flow.ireko", "out/");
```

## Development

```sh
pnpm install
pnpm test         # vitest run
pnpm test:watch
pnpm typecheck
pnpm build        # tsup → dist/
```

Repo layout:

```
src/
├── ast.ts       # AST node types
├── lexer.ts     # hand-written lexer
├── parser.ts    # recursive descent → AST
├── linker.ts    # ref resolution, cycle detection
├── emitter.ts   # AST → Mermaid + diagrams.json
├── build.ts     # end-to-end build + static site writer
├── cli.ts       # `ireko` command
├── errors.ts    # IrekoError + formatting
└── viewer/      # index.html + app.js + style.css
tests/           # vitest suites
examples/        # .ireko sample sources
                 #   oidc.ireko                   — OIDC login flow (the quick-start)
                 #   login-consolidation.ireko    — longer case study
                 #   architecture.ireko           — ireko's own pipeline, written in ireko
                 #   tls-handshake.ireko         — anchored ref demo (flowchart nodes as drill-downs)
```

## Limitations (v0)

- Single-file only. No `import "./other.ireko"` yet.
- No inline expansion — sub-flows always open in a new view.
- No theming beyond Mermaid defaults.
- No PDF/PNG export.
- The opaque-body lexer handles nested braces in class/state diagrams and
  ER cardinality markers (`||--o{`), but other exotic Mermaid syntax with
  unmatched braces in a line may confuse the brace-depth tracking.

## License

MIT. See [LICENSE](./LICENSE) and [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md).

Mermaid is used for rendering; `ireko` includes no Mermaid source code, but
the generated viewer loads Mermaid from a CDN. Mermaid itself is MIT
licensed — see `THIRD_PARTY_LICENSES.md` for its copyright notice.
