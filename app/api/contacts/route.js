import { NextResponse } from "next/server";
import { contactsToCsv, queryContacts, readContacts, sortContacts } from "@/lib/contact-store";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const sortBy = searchParams.get("sort_by") || "full_name";
    const sortDir = searchParams.get("sort_dir") || "asc";
    const page = searchParams.get("page") || "1";
    const pageSize = searchParams.get("page_size") || "25";
    const format = (searchParams.get("format") || "json").toLowerCase();

    if (format === "csv") {
      const contacts = await readContacts();
      const filtered = contacts.filter((contact) => {
        const value = q.trim().toLowerCase();
        if (!value) {
          return true;
        }
        return (
          contact.user_id.toLowerCase().includes(value) ||
          contact.full_name.toLowerCase().includes(value) ||
          contact.email.toLowerCase().includes(value) ||
          contact.phone.toLowerCase().includes(value) ||
          contact.note.toLowerCase().includes(value)
        );
      });
      const sorted = sortContacts(filtered, sortBy, sortDir);
      const csv = contactsToCsv(sorted);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="user_contact_table.csv"',
        },
      });
    }

    const result = await queryContacts({
      q,
      sort_by: sortBy,
      sort_dir: sortDir,
      page,
      page_size: pageSize,
    });

    return NextResponse.json({
      query: q,
      sort_by: sortBy,
      sort_dir: sortDir,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to read contacts",
      },
      { status: 500 }
    );
  }
}
