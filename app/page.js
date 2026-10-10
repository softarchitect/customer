"use client";

import { useEffect, useMemo, useState } from "react";

function escapeCopyValue(value) {
  return String(value ?? "").trim();
}

function extractFirstName(fullName) {
  const cleaned = String(fullName ?? "").trim();
  if (!cleaned) {
    return "there";
  }
  const [firstToken] = cleaned.split(/\s+/);
  return firstToken || "there";
}

export default function HomePage() {
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("full_name");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [status, setStatus] = useState("Loading...");
  const [pendingUserIds, setPendingUserIds] = useState(() => new Set());
  const [pageInput, setPageInput] = useState("");
  const [emailTemplateTitle, setEmailTemplateTitle] = useState("");
  const [emailTemplateContent, setEmailTemplateContent] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [copyFeedbackByKey, setCopyFeedbackByKey] = useState({});

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({
      q: query,
      sort_by: sortBy,
      sort_dir: sortDir,
      format: "csv",
    });
    return `/api/contacts?${params.toString()}`;
  }, [query, sortBy, sortDir]);

  async function copyTemplateText(type, contact) {
    const firstName = extractFirstName(contact?.full_name ?? "");
    const renderedTitle = emailTemplateTitle.replaceAll("{{first_name}}", firstName);
    const renderedContent = emailTemplateContent.replaceAll("{{first_name}}", firstName);
    const text = type === "title" ? renderedTitle : renderedContent;
    if (!text.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${type === "title" ? "Email title" : "Email content"} copied for ${firstName}`);
      const copyKey = `${contact?.user_id || "unknown"}:${type}`;
      setCopyFeedbackByKey((prev) => ({ ...prev, [copyKey]: true }));
      setTimeout(() => {
        setCopyFeedbackByKey((prev) => ({ ...prev, [copyKey]: false }));
      }, 700);
    } catch {
      setStatus("Clipboard copy failed");
    }
  }

  async function loadTemplate() {
    setTemplateLoading(true);
    try {
      const response = await fetch("/api/template");
      if (!response.ok) {
        throw new Error(`Template request failed (${response.status})`);
      }
      const data = await response.json();
      setEmailTemplateTitle(data?.template?.title || "");
      setEmailTemplateContent(data?.template?.content || "");
      setTemplateLoaded(true);
    } finally {
      setTemplateLoading(false);
    }
  }

  async function saveTemplate() {
    setTemplateSaving(true);
    try {
      const response = await fetch("/api/template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: emailTemplateTitle,
          content: emailTemplateContent,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Template save failed (${response.status})`);
      }
      setStatus("Email template saved");
    } catch (error) {
      window.alert(error.message || "Could not save template.");
      setStatus("Template save failed");
    } finally {
      setTemplateSaving(false);
    }
  }

  async function loadContacts() {
    const params = new URLSearchParams({
      q: query,
      sort_by: sortBy,
      sort_dir: sortDir,
      page: String(page),
      page_size: String(pageSize),
    });

    setContactsLoading(true);
    setStatus("Loading...");
    try {
      const response = await fetch(`/api/contacts?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      const data = await response.json();
      setContacts(data.contacts || []);
      setTotalPages(Number(data.total_pages || 1));
      setTotalCount(Number(data.total_count || 0));
      setPage(Number(data.page || 1));
      setStatus(`Showing ${data.count ?? 0} user(s)`);
    } finally {
      setContactsLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    loadContacts().catch((error) => {
      if (!mounted) {
        return;
      }
      setStatus("Error");
      console.error(error);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sortBy, sortDir, page, pageSize]);

  useEffect(() => {
    let mounted = true;
    loadTemplate().catch((error) => {
      if (!mounted) {
        return;
      }
      setStatus("Template load failed");
      console.error(error);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  async function saveMeta(userId, payload, showMessage) {
    setPendingUserIds((prev) => new Set(prev).add(userId));
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(userId)}/meta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Update failed (${response.status})`);
      }
      if (showMessage) {
        setStatus(`Saved tracking for user ${userId}`);
      }
    } finally {
      setPendingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  async function removeUser(userId, fullName) {
    const confirmed = window.confirm(`Remove ${fullName} (ID: ${userId})?\nThis updates users.csv and orders.csv.`);
    if (!confirmed) {
      return;
    }

    setPendingUserIds((prev) => new Set(prev).add(userId));
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(userId)}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${response.status})`);
      }
      setStatus(`User ${userId} removed`);
      await loadContacts();
    } catch (error) {
      window.alert(error.message || "Could not remove user.");
      setStatus("Remove failed");
    } finally {
      setPendingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  return (
    <main className="app">
      {(contactsLoading || templateLoading) && (
        <div className="loading-overlay" aria-live="polite" aria-busy="true">
          <div className="spinner" />
          <span>Loading data from Google Sheets...</span>
        </div>
      )}
      <section className="hero">
        <h1>User Contact Directory</h1>
        <p className="subtitle">Next.js version for Vercel deployment with CSV export, flags, notes, and remove actions.</p>
      </section>

      <section className="controls">
        <label className="search-wrap">
          <span aria-hidden>🔎</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email, phone, user ID, note..." />
        </label>
        <div className="toolbar">
          <select className="control" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="full_name">Sort: Name</option>
            <option value="email">Sort: Email</option>
            <option value="phone">Sort: Phone</option>
            <option value="user_id">Sort: User ID</option>
          </select>
          <button className="control button" type="button" onClick={() => setSortDir((v) => (v === "asc" ? "desc" : "asc"))}>
            {sortDir === "asc" ? "Asc" : "Desc"}
          </button>
          <select className="control" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
          <a className="control button" href={exportHref}>
            Export Table CSV
          </a>
        </div>
        <div className="status">{status}</div>
      </section>

      <section className="template-panel">
        <div className="template-header">
          <h2>Email Template</h2>
          <p className="subtitle">
            Use <code>{"{{first_name}}"}</code> anywhere in title/content for automatic personalization. Copy buttons are in each user row.
          </p>
        </div>
        <div className="template-grid">
          <label className="template-field">
            <span>Title</span>
            <input
              className="control template-input"
              value={emailTemplateTitle}
              onChange={(e) => setEmailTemplateTitle(e.target.value)}
              placeholder="Email title..."
              disabled={!templateLoaded}
            />
          </label>
          <label className="template-field template-wide">
            <span>Content</span>
            <textarea
              className="template-textarea"
              value={emailTemplateContent}
              onChange={(e) => setEmailTemplateContent(e.target.value)}
              placeholder="Email content..."
              disabled={!templateLoaded}
            />
          </label>
          <div className="template-actions">
            <button className="control button" type="button" onClick={saveTemplate} disabled={!templateLoaded || templateSaving}>
              {templateSaving ? "Saving..." : "Save Template"}
            </button>
            <span className="muted">Tip: click row action buttons to copy personalized email text.</span>
          </div>
        </div>
      </section>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 90 }}>User ID</th>
              <th className="sortable" onClick={() => setSortBy("full_name")}>
                Full Name
              </th>
              <th className="sortable" onClick={() => setSortBy("email")}>
                Email
              </th>
              <th className="sortable" onClick={() => setSortBy("phone")}>
                Phone
              </th>
              <th style={{ width: 210 }}>Sent Flags</th>
              <th style={{ width: 100 }}>Received</th>
              <th style={{ width: 340 }}>Note</th>
              <th style={{ width: 250 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty">
                  No matching users found.
                </td>
              </tr>
            ) : (
              contacts.map((contact) => {
                const pending = pendingUserIds.has(contact.user_id);
                const copyTitleKey = `${contact.user_id}:title`;
                const copyContentKey = `${contact.user_id}:content`;
                const titleCopied = Boolean(copyFeedbackByKey[copyTitleKey]);
                const contentCopied = Boolean(copyFeedbackByKey[copyContentKey]);
                return (
                  <tr key={contact.user_id}>
                    <td className="muted">{contact.user_id || "-"}</td>
                    <td className="name">{contact.full_name || "-"}</td>
                    <td>
                      <div className="value-cell">
                        <span>{contact.email || "-"}</span>
                        <button
                          className="copy-btn"
                          type="button"
                          onClick={async () => {
                            const value = escapeCopyValue(contact.email);
                            if (!value) return;
                            await navigator.clipboard.writeText(value);
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="value-cell">
                        <span>{contact.phone || "-"}</span>
                        <button
                          className="copy-btn"
                          type="button"
                          onClick={async () => {
                            const value = escapeCopyValue(contact.phone);
                            if (!value) return;
                            await navigator.clipboard.writeText(value);
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="meta-flags">
                        {[
                          ["sent_whatsapp", "WA"],
                          ["sent_email", "Email"],
                          ["sent_telegram", "TG"],
                          ["sent_other", "Other"],
                        ].map(([field, label]) => (
                          <label className="meta-flag" key={field}>
                            <input
                              type="checkbox"
                              checked={Boolean(contact[field])}
                              disabled={pending}
                              onChange={async (e) => {
                                const updated = contacts.map((item) =>
                                  item.user_id === contact.user_id ? { ...item, [field]: e.target.checked } : item
                                );
                                setContacts(updated);
                                try {
                                  await saveMeta(contact.user_id, { [field]: e.target.checked }, false);
                                } catch (error) {
                                  window.alert(error.message || "Could not update flag.");
                                }
                              }}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td>
                      <label className="meta-flag">
                        <input
                          type="checkbox"
                          checked={Boolean(contact.received)}
                          disabled={pending}
                          onChange={async (e) => {
                            const updated = contacts.map((item) =>
                              item.user_id === contact.user_id ? { ...item, received: e.target.checked } : item
                            );
                            setContacts(updated);
                            try {
                              await saveMeta(contact.user_id, { received: e.target.checked }, false);
                            } catch (error) {
                              window.alert(error.message || "Could not update received flag.");
                            }
                          }}
                        />
                        Yes
                      </label>
                    </td>
                    <td>
                      <div className="note-wrap">
                        <input
                          className="note-input"
                          value={contact.note || ""}
                          disabled={pending}
                          onChange={(e) => {
                            const updated = contacts.map((item) =>
                              item.user_id === contact.user_id ? { ...item, note: e.target.value } : item
                            );
                            setContacts(updated);
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              try {
                                await saveMeta(contact.user_id, { note: contact.note || "" }, true);
                              } catch (error) {
                                window.alert(error.message || "Could not save note.");
                              }
                            }
                          }}
                          placeholder="Add note..."
                        />
                        <button
                          className="note-save"
                          type="button"
                          disabled={pending}
                          onClick={async () => {
                            try {
                              await saveMeta(contact.user_id, { note: contact.note || "" }, true);
                            } catch (error) {
                              window.alert(error.message || "Could not save note.");
                            }
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className={`copy-btn action-btn ${titleCopied ? "copy-pop copied" : ""}`}
                          type="button"
                          onClick={() => copyTemplateText("title", contact)}
                          disabled={pending || !templateLoaded}
                        >
                          {titleCopied ? "Copied!" : "Copy Title"}
                        </button>
                        <button
                          className={`copy-btn action-btn ${contentCopied ? "copy-pop copied" : ""}`}
                          type="button"
                          onClick={() => copyTemplateText("content", contact)}
                          disabled={pending || !templateLoaded}
                        >
                          {contentCopied ? "Copied!" : "Copy Content"}
                        </button>
                        <button
                          className="remove-btn action-btn"
                          type="button"
                          disabled={pending}
                          onClick={() => removeUser(contact.user_id, contact.full_name)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="pagination">
          <div className="muted">
            Page {page} of {totalPages} • {totalCount} user(s)
          </div>
          <div className="pager">
            <button className="control button" type="button" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>
              Previous
            </button>
            <button
              className="control button"
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
            >
              Next
            </button>
            <div className="page-jump">
              <input
                className="control"
                type="number"
                min="1"
                max={totalPages}
                placeholder={`1-${totalPages}`}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const target = Number.parseInt(pageInput, 10);
                    if (Number.isInteger(target) && target >= 1) {
                      setPage(Math.min(totalPages, target));
                    }
                  }
                }}
              />
              <button
                className="control button"
                type="button"
                onClick={() => {
                  const target = Number.parseInt(pageInput, 10);
                  if (Number.isInteger(target) && target >= 1) {
                    setPage(Math.min(totalPages, target));
                  }
                }}
              >
                Go
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
