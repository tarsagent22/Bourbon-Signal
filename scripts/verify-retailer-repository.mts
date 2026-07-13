import assert from "node:assert/strict";
import { RetailerRepository } from "../src/lib/retailer-repository.ts";

const url = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || process.env.BOURBON_QUEUE_DATABASE_URL || process.env.DATABASE_URL;
assert.ok(url, "Retailer database URL is required");

const repository = new RetailerRepository(url);
await repository.ensureSchema();
const applications = await repository.listApplications(1, 0);
assert.ok(Array.isArray(applications));
console.log("Retailer repository schema and read path verified.");
