import { NextResponse } from "next/server";
import { readEmailTemplate, writeEmailTemplate } from "@/lib/contact-store";

export async function GET() {
  try {
    const template = await readEmailTemplate();
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to read email template",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: "Body must be an object" }, { status: 400 });
    }

    const saved = await writeEmailTemplate({
      title: body.title ?? "",
      content: body.content ?? "",
    });

    return NextResponse.json({ ok: true, template: saved });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save email template",
      },
      { status: 500 }
    );
  }
}
