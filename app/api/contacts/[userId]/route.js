import { NextResponse } from "next/server";
import { removeUser } from "@/lib/contact-store";

export async function DELETE(_request, { params }) {
  try {
    const routeParams = await params;
    const userId = routeParams?.userId ? String(routeParams.userId).trim() : "";
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Missing user_id" }, { status: 400 });
    }

    const removed = await removeUser(userId);
    if (removed.users_removed === 0 && removed.orders_removed === 0) {
      return NextResponse.json({ ok: false, error: "User not found", user_id: userId }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      user_id: userId,
      users_removed: removed.users_removed,
      orders_removed: removed.orders_removed,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
