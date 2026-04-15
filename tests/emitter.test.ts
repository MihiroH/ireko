import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { link } from "../src/linker.js";
import {
  emit,
  IREKO_MARKER_OPEN,
  IREKO_MARKER_CLOSE,
  IREKO_MARKER_REGEX,
} from "../src/emitter.js";

const build = (src: string) => emit(link(parse(src)));

describe("emitter", () => {
  it("emits Mermaid for each diagram with markers at ref sites", () => {
    const out = build(`@root
diagram "Root" {
  sequenceDiagram
    participant A
    participant B
    A->>B: hi
    ref Sub
    B->>A: bye
}
diagram Sub "The Sub" {
  sequenceDiagram
    participant X
    X->>X: noop
}
`);
    const rootId = out.root;
    const root = out.diagrams[rootId];
    expect(root.mermaid).toContain("sequenceDiagram");
    expect(root.mermaid).toContain("Note over B: 🔍 The Sub");
    // Marker must be present
    const marker = `${IREKO_MARKER_OPEN}Sub${IREKO_MARKER_CLOSE}`;
    expect(root.mermaid).toContain(marker);
    expect(root.refs).toEqual([{ ref: "Sub", label: "The Sub" }]);
  });

  it("uses note over last participant for sequence diagrams", () => {
    const out = build(`@root
diagram "R" {
  sequenceDiagram
    participant Alpha
    participant Beta
    ref Sub
}
diagram Sub "S" {
  sequenceDiagram
    x
}
`);
    // Should be 'Note over Beta' since Beta was declared last
    expect(out.diagrams[out.root].mermaid).toContain("Note over Beta:");
  });

  it("emits a node for flowchart diagrams", () => {
    const out = build(`@root
diagram "R" {
  flowchart TB
    A --> B
    ref Sub
    B --> C
}
diagram Sub "S" {
  sequenceDiagram
    x
}
`);
    const m = out.diagrams[out.root].mermaid;
    expect(m).toContain("__ref_Sub__[");
    expect(m).toContain("🔍 S");
  });

  it("emits a state stub for stateDiagram-v2", () => {
    const out = build(`@root
diagram "R" {
  stateDiagram-v2
    [*] --> Idle
    ref Sub
}
diagram Sub "S" {
  sequenceDiagram
    x
}
`);
    expect(out.diagrams[out.root].mermaid).toContain('state "🔍 S');
    expect(out.diagrams[out.root].mermaid).toContain("as Sub_ref");
  });

  it("falls back to a comment for unknown host types", () => {
    const out = build(`@root
diagram "R" {
  erDiagram
    CUSTOMER ||--o{ ORDER : places
    ref Sub
}
diagram Sub "S" {
  sequenceDiagram
    x
}
`);
    expect(out.diagrams[out.root].mermaid).toContain("%% ref: Sub");
  });

  it("marker regex matches the emitted markers", () => {
    const out = build(`@root
diagram "R" {
  sequenceDiagram
    participant A
    ref Sub
    ref Sub
}
diagram Sub "S" {
  sequenceDiagram
    x
}
`);
    const m = out.diagrams[out.root].mermaid;
    IREKO_MARKER_REGEX.lastIndex = 0;
    const matches: string[] = [];
    let match;
    while ((match = IREKO_MARKER_REGEX.exec(m))) {
      matches.push(match[1]);
    }
    expect(matches).toEqual(["Sub", "Sub"]);
  });

  it("synthesizes a participant if ref comes before any participant declaration", () => {
    const out = build(`@root
diagram "R" {
  sequenceDiagram
    ref Sub
}
diagram Sub "S" {
  sequenceDiagram
    x
}
`);
    const m = out.diagrams[out.root].mermaid;
    expect(m).toContain("participant Actor");
    expect(m).toContain("Note over Actor:");
  });
});
