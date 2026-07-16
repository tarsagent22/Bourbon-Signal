#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildCompanyScorecard } from "../../src/lib/company-control-room.ts";

const ROOT = path.resolve(new URL("../../", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const REPORT_DIR = path.join(ROOT, "automation", "bourbon-signal", "reports");
const DEFAULT_INPUT = path.join(REPORT_DIR, "company-control-room-snapshot-latest.json");

function option(args: string[], name: string) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

export async function main(argv = process.argv.slice(2)) {
  const input = path.resolve(option(argv, "input") || DEFAULT_INPUT);
  const snapshot = JSON.parse(await readFile(input, "utf8")) as Record<string, unknown>;
  const generatedAt = option(argv, "at") || (typeof snapshot.checkedAt === "string" ? snapshot.checkedAt : new Date().toISOString());
  const scorecard = buildCompanyScorecard(snapshot, generatedAt);
  if (argv.includes("--apply")) {
    await mkdir(REPORT_DIR, { recursive: true });
    const stamp = generatedAt.replace(/[:.]/g, "-");
    await Promise.all([
      writeFile(path.join(REPORT_DIR, "company-scorecard-latest.json"), `${JSON.stringify(scorecard, null, 2)}\n`),
      writeFile(path.join(REPORT_DIR, `company-scorecard-${stamp}.json`), `${JSON.stringify(scorecard, null, 2)}\n`),
    ]);
  }
  console.log(JSON.stringify({ mode: argv.includes("--apply") ? "apply" : "dry-run", ...scorecard }, null, 2));
  return scorecard;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
