"use client";

import Link from "next/link";
import type { Bookmark } from "@/lib/bookmarks";

interface BookmarkFormProps {
  submitLabel: string;
  cancelHref: string;
  note?: string;
  bookmark?: Bookmark;
}

export function BookmarkForm({
  submitLabel,
  cancelHref,
  note,
  bookmark,
}: BookmarkFormProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div>
        <label
          htmlFor="note"
          style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}
        >
          Note Slug *
        </label>
        <input
          type="text"
          id="note"
          name="note"
          required
          defaultValue={note || bookmark?.note || ""}
          readOnly={!!note}
          style={{
            width: "100%",
            padding: "8px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            backgroundColor: note ? "#f5f5f5" : "white",
          }}
        />
      </div>

      <div>
        <label
          htmlFor="label"
          style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}
        >
          Label *
        </label>
        <input
          type="text"
          id="label"
          name="label"
          required
          defaultValue={bookmark?.label || ""}
          style={{
            width: "100%",
            padding: "8px",
            border: "1px solid #ddd",
            borderRadius: "4px",
          }}
        />
      </div>

      {/*
       * Slug and date, as the note form has. The server action already read
       * both; without inputs every bookmark took `Date.now()`, so the sort key
       * of a generated fixture depended on how fast the generator ran.
       */}
      <div>
        {/*
         * "Bookmark Slug", not "Slug": the reference field above is labelled
         * "Note Slug", and a bare "Slug" would make every
         * `getByLabel(/Slug/)` in the suite ambiguous.
         */}
        <label
          htmlFor="slug"
          style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}
        >
          Bookmark Slug (optional, auto-generated from label)
        </label>
        <input
          type="text"
          id="slug"
          name="slug"
          style={{
            width: "100%",
            padding: "8px",
            border: "1px solid #ddd",
            borderRadius: "4px",
          }}
        />
      </div>

      <div>
        <label
          htmlFor="date"
          style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}
        >
          Date (UTC)
        </label>
        <input
          type="datetime-local"
          id="date"
          name="date"
          step="any"
          defaultValue={
            bookmark ? new Date(bookmark.date).toISOString().slice(0, 16) : ""
          }
          style={{
            width: "100%",
            padding: "8px",
            border: "1px solid #ddd",
            borderRadius: "4px",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
        <button
          type="submit"
          style={{
            backgroundColor: "#0070f3",
            color: "white",
            padding: "10px 20px",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {submitLabel}
        </button>
        <Link
          href={cancelHref}
          style={{
            padding: "10px 20px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            textDecoration: "none",
            color: "#666",
          }}
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
