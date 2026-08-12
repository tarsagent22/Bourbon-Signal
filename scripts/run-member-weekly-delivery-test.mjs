import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
const testFile = fileURLToPath(new URL("./test-member-weekly-delivery.mts", import.meta.url));
const existingNodeOptions = process.env.NODE_OPTIONS?.trim() || "";
const nodeOptions = `${existingNodeOptions} --conditions=react-server`.trim();
const result = spawnSync(process.execPath, [tsxCli, testFile], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
  stdio: "inherit",
});
process.exit(result.status ?? 1);
