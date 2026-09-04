// Retired permanently. No environment-file reads, audience lookups or provider calls.
// A new campaign requires owner review and the consent/cohort/idempotency pipeline.
console.error('Retired: legacy newsletter sending is disabled, including --apply. No messages sent.');
process.exitCode = 1;
