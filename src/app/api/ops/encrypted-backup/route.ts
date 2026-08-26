import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

import {
  claimBackupRequest,
  cleanupBackupRequestClaims,
  collectProductionBackup,
  encryptBackupPayload,
  verifyBackupRequest,
} from "@/lib/secure-backup-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function connectionString() {
  return process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || process.env.BOURBON_QUEUE_DATABASE_URL
    || process.env.DATABASE_URL
    || null;
}

export async function POST(request: Request) {
  const timestamp = request.headers.get("x-backup-timestamp")?.trim() || "";
  const nonce = request.headers.get("x-backup-nonce")?.trim() || "";
  const signature = request.headers.get("x-backup-signature")?.trim() || "";
  if (!verifyBackupRequest({ timestamp, nonce, signature })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const database = connectionString();
  if (!database) {
    return NextResponse.json({ error: "Backup storage unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const sql = neon(database);
  try {
    if (!await claimBackupRequest(sql, timestamp, nonce)) {
      return NextResponse.json({ error: "Backup request already used or rate limited" }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const payload = await collectProductionBackup(sql);
    const envelope = encryptBackupPayload(payload);
    console.info("Encrypted production backup prepared", JSON.stringify({
      generatedAt: payload.generatedAt,
      tableCount: Object.keys(payload.tables).length,
      encryptedBytes: envelope.ciphertext.length,
    }));
    return NextResponse.json(envelope, {
      headers: {
        "Cache-Control": "no-store, private, max-age=0",
        "Content-Disposition": `attachment; filename="bourbon-signal-neon-${payload.generatedAt.replace(/[:.]/g, "-")}.bsbackup"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.error("Encrypted production backup failed", JSON.stringify({ code: "backup_export_failed" }));
    return NextResponse.json({ error: "Backup unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    await cleanupBackupRequestClaims(sql).catch(() => undefined);
  }
}
