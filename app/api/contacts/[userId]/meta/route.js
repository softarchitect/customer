import { NextResponse } from "next/server";
import { updateUserMeta, userExists } from "@/lib/contact-store";

const ALLOWED_META_FIELDS = new Set([
  "sent_whatsapp",
  "sent_email",
  "sent_telegram",
  "sent_other",
  "received",
  "note",
]);

export async function PATCH(request, { params }) {
  try {
    const routeParams = await params;
    const userId = routeParams?.userId ? String(routeParams.userId).trim() : "";
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Missing user_id" }, { status: 400 });
    }

    const exists = await userExists(userId);
    if (!exists) {
      return NextResponse.json({ ok: false, error: "User not found", user_id: userId }, { status: 404 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: "Body must be an object" }, { status: 400 });
    }

    const updates = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_META_FIELDS.has(key)) {
        updates[key] = value;
      }
    }

    const saved = await updateUserMeta(userId, updates);
    return NextResponse.json({ ok: true, user_id: userId, meta: saved });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Meta update failed" },
      { status: 500 }
    );
  }
}
