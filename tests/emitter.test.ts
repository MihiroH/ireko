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
    expect(root.refs).toEqual([{ ref: "Sub", label: "The Sub", anchor: null }]);
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
    expect(m).toContain("participant __ireko_actor");
    expect(m).toContain("Note over __ireko_actor:");
  });

  // --- Anchored refs (`ref Anchor > Target`) ---

  it("anchored ref in flowchart emits click + class instead of new node", () => {
    const out = build(`@root
diagram "R" {
  flowchart LR
    Day1 --> Day2 --> Day3
    ref Day1 > Sub
}
diagram Sub "Detail" {
  sequenceDiagram
    A->>B: hi
}
`);
    const m = out.diagrams[out.root].mermaid;
    // Should NOT create a __ref_ node
    expect(m).not.toContain("__ref_Sub__");
    // Should emit native Mermaid click directive
    expect(m).toContain('click Day1 "#Sub"');
    // Should define and apply a styling class
    expect(m).toContain("classDef ireko_ref");
    expect(m).toContain("class Day1 ireko_ref");
    // Refs metadata carries the anchor
    expect(out.diagrams[out.root].refs).toEqual([
      { ref: "Sub", label: "Detail", anchor: "Day1" },
    ]);
  });

  it("anchored ref in sequenceDiagram emits note on specified participant", () => {
    const out = build(`@root
diagram "R" {
  sequenceDiagram
    participant A
    participant B
    participant C
    A->>B: hi
    ref A > Sub
}
diagram Sub "S" {
  sequenceDiagram
    x
}
`);
    const m = out.diagrams[out.root].mermaid;
    // Note should be on A (the anchor), not B (last participant)
    expect(m).toContain("Note over A: 🔍 S");
  });

  it("classDef is emitted only once for multiple anchored refs", () => {
    const out = build(`@root
diagram "R" {
  flowchart LR
    X --> Y --> Z
    ref X > SubA
    ref Y > SubB
}
diagram SubA "A" {
  sequenceDiagram
    x
}
diagram SubB "B" {
  sequenceDiagram
    y
}
`);
    const m = out.diagrams[out.root].mermaid;
    const classDefCount = (m.match(/classDef ireko_ref/g) || []).length;
    expect(classDefCount).toBe(1);
    expect(m).toContain('click X "#SubA"');
    expect(m).toContain('click Y "#SubB"');
    expect(m).toContain("class X ireko_ref");
    expect(m).toContain("class Y ireko_ref");
  });

  it("mixes standalone and anchored refs in same diagram", () => {
    const out = build(`@root
diagram "R" {
  flowchart LR
    A --> B --> C
    ref A > SubA
    ref SubB
}
diagram SubA "Detail A" {
  sequenceDiagram
    x
}
diagram SubB "Detail B" {
  sequenceDiagram
    y
}
`);
    const m = out.diagrams[out.root].mermaid;
    expect(m).toContain('click A "#SubA"');
    expect(m).toContain('__ref_SubB__["🔍 Detail B');
    expect(out.diagrams[out.root].refs).toHaveLength(2);
    expect(out.diagrams[out.root].refs[0].anchor).toBe("A");
    expect(out.diagrams[out.root].refs[1].anchor).toBeNull();
  });
});
