import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "New gift purchases are currently unavailable. Existing gifts can still be redeemed." }, { status: 410 });
}
