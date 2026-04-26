/**
 * Shared pattern for user-authored identifiers. Centralized here so the
 * lexer, parser, emitter, and linker agree on the same shape.
 *
 * Note: the browser viewer (`src/viewer/app.js`) has its own copy — it's
 * loaded without a bundler so it can't import from TypeScript. Keep them
 * in sync.
 */
export const IDENT_PATTERN = "[A-Za-z_][A-Za-z0-9_]*";
