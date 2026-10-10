# User Contact Directory (Next.js)

This project is now a **Next.js app** ready for deployment to Vercel.

It reads `orders.csv` and `users.csv`, and provides:

- Search by name, email, phone, user ID, and note
- Send flags (`WhatsApp`, `Email`, `Telegram`, `Other`)
- `Received` flag
- Note field per contact
- Remove user
- Export table CSV for Google Sheets/Docs import
- Email template loaded from Google Sheets

## Local Run

From `D:\Data\customer`:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Google Sheet Wiring

This app is wired to your Google Sheet:

- Spreadsheet ID: `1GDxJxIhuCqkoW8ugybKUYfUJvzC1IYLQcE7cqsLt7yo`
- GID (worksheet tab): `86234225`

Create `.env.local` from `.env.example` and fill:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

Then share the Google Sheet with your service account email as **Editor**.

Without these credentials, API routes will return a clear error message.

## API Endpoints

- `GET /api/contacts`
  - Query: `q`, `sort_by`, `sort_dir`, `page`, `page_size`
  - Use `format=csv` for CSV export
- `PATCH /api/contacts/{user_id}/meta`
  - Body keys: `sent_whatsapp`, `sent_email`, `sent_telegram`, `sent_other`, `received`, `note`
- `DELETE /api/contacts/{user_id}`
  - Removes user row(s) from the Google Sheet tab
- `GET /api/template`
  - Returns email template (`title`, `content`) from the spreadsheet
- `PATCH /api/template`
  - Updates email template (`title`, `content`) in the spreadsheet

## Vercel Note

The app is deployable to Vercel as-is.  
Set the same environment variables in Vercel Project Settings.

## Template Storage

Email template is stored in the same spreadsheet on a tab named `Templates` by default.

- Column A: `key`
- Column B: `value`
- Keys used:
  - `email_title`
  - `email_content`

You can change the tab name with `GOOGLE_TEMPLATE_SHEET_TITLE`.
