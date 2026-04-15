#!/usr/bin/env node
import { resolve } from "node:path";
import { build } from "./build.js";
import { IrekoError, formatError } from "./errors.js";

const USAGE = `ireko — nested diagrams

Usage:
  ireko build <input.ireko> [-o|--out <dir>]
  ireko --help
  ireko --version

Options:
  -o, --out <dir>    Output directory (default: out/)
  -h, --help         Show this message
  -v, --version      Show version
`;

function parseArgs(argv: string[]): {
  command: string | null;
  input: string | null;
  out: string;
  help: boolean;
  version: boolean;
} {
  const result = {
    command: null as string | null,
    input: null as string | null,
    out: "out",
    help: false,
    version: false,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      result.help = true;
    } else if (a === "-v" || a === "--version") {
      result.version = true;
    } else if (a === "-o" || a === "--out") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error(`${a} requires a value`);
      }
      result.out = next;
      i++;
    } else if (a.startsWith("--out=")) {
      result.out = a.slice("--out=".length);
    } else if (a.startsWith("-")) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      positional.push(a);
    }
  }
  if (positional.length > 0) result.command = positional[0];
  if (positional.length > 1) result.input = positional[1];
  return result;
}

function main(): number {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`ireko: ${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`ireko 0.1.0\n`);
    return 0;
  }

  if (args.command === null) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (args.command !== "build") {
    process.stderr.write(`ireko: unknown command '${args.command}'\n\n${USAGE}`);
    return 2;
  }

  if (!args.input) {
    process.stderr.write(`ireko: 'build' requires an input file\n\n${USAGE}`);
    return 2;
  }

  const inputPath = resolve(args.input);
  const outDir = resolve(args.out);

  try {
    const result = build(inputPath, outDir);
    for (const w of result.warnings) {
      process.stderr.write(`ireko: warning: ${w}\n`);
    }
    process.stdout.write(
      `ireko: wrote ${result.written.length} file(s) to ${outDir}\n`,
    );
    process.stdout.write(
      `  open ${outDir}/index.html#${result.data.root} in a browser\n`,
    );
    return 0;
  } catch (err) {
    if (err instanceof IrekoError) {
      process.stderr.write(formatError(err, args.input) + "\n");
    } else {
      process.stderr.write(`ireko: ${(err as Error).message}\n`);
    }
    return 1;
  }
}

process.exit(main());
