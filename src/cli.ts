#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { build } from "./build.js";
import { IrekoError, formatError } from "./errors.js";
import pkg from "../package.json" with { type: "json" };

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

interface Parsed {
  command: string | null;
  input: string | null;
  out: string;
  help: boolean;
  version: boolean;
}

function parseCliArgs(argv: string[]): Parsed {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      out: { type: "string", short: "o", default: "out" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    strict: true,
    allowPositionals: true,
  });
  return {
    command: positionals[0] ?? null,
    input: positionals[1] ?? null,
    out: values.out as string,
    help: values.help as boolean,
    version: values.version as boolean,
  };
}

function main(): number {
  let args: Parsed;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`ireko: ${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`ireko ${pkg.version}\n`);
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

// Set exitCode rather than calling process.exit so buffered stdout (piped
// stdio is async) has a chance to flush before Node shuts down.
process.exitCode = main();
