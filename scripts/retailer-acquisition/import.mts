import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { importRetailerProspectArtifact } from "../../src/lib/retailer-prospect-import.ts";
import { getRetailerProspectRepository } from "../../src/lib/retailer-prospect-repository.ts";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

const inputPath = option("--input");
const auditPath = option("--audit");
const ownerEmail = option("--owner");
const apply = process.argv.includes("--apply");
if (!inputPath || !auditPath || !ownerEmail) {
  throw new Error("Usage: npm run acquisition:import -- --input <discovered-or-ranked.json> --audit <audit.json> --owner <owner-email> [--apply]");
}

await mkdir(path.dirname(path.resolve(auditPath)), { recursive: true });
const auditFile = await open(auditPath, "wx");
try {
  const artifact = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const audit = await importRetailerProspectArtifact({
    artifact,
    actorEmail: ownerEmail,
    apply,
    sourceFile: path.resolve(inputPath),
    repository: apply ? getRetailerProspectRepository() : undefined,
  });
  await auditFile.writeFile(`${JSON.stringify({ ok: true, ...audit }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ mode: audit.mode, audit: path.resolve(auditPath), summary: audit.summary })}\n`);
} catch (error) {
  await auditFile.writeFile(`${JSON.stringify({
    ok: false,
    schemaVersion: 1,
    operation: "retailer_prospect_import",
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    actor: ownerEmail.trim().toLowerCase(),
    sourceFile: path.resolve(inputPath),
    error: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`);
  throw error;
} finally {
  await auditFile.close();
}
