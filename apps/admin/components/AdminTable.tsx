/**
 * AdminTable — semantic <table> for cpanel listings.
 *
 * Phase 1.0-C (C3/C4/C5). Token-driven; warm-only palette via tokens.css.
 * Renders a real <table> for screen-reader semantics. The wrapping div
 * provides horizontal overflow for narrow viewports.
 *
 * Typing is strict on column shape (column id + cell renderer) but the
 * row data shape is generic — callers pin it via the `<R>` parameter.
 */
import type React from "react";

export interface AdminTableColumn<R> {
  /** Stable column id used as React key + th id for accessible header → cell association. */
  id: string;
  /** Header label. */
  label: string;
  /** Cell renderer; gets the raw row and the row index. */
  render: (row: R, index: number) => React.ReactNode;
  /** Optional CSS `width` for the column (defaults to auto). */
  width?: string;
  /** Right-align numeric columns. */
  align?: "left" | "right";
}

export interface AdminTableProps<R> {
  /** Accessible caption — required, screen-reader-only by default. */
  caption: string;
  /** Visually hide the caption (defaults to true). */
  captionHidden?: boolean;
  columns: ReadonlyArray<AdminTableColumn<R>>;
  rows: ReadonlyArray<R>;
  /** Stable key for each row. */
  rowKey: (row: R, index: number) => string;
  /** Shown when `rows` is empty. */
  emptyMessage: string;
}

export function AdminTable<R>({
  caption,
  captionHidden = true,
  columns,
  rows,
  rowKey,
  emptyMessage,
}: AdminTableProps<R>): React.ReactElement {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <caption className={captionHidden ? "sz-sr-only" : undefined}>
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                id={`th-${col.id}`}
                scope="col"
                style={{
                  width: col.width,
                  textAlign: col.align ?? "left",
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="adm-empty"
                style={{ textAlign: "center" }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={rowKey(row, index)}>
                {columns.map((col) => (
                  <td
                    key={col.id}
                    headers={`th-${col.id}`}
                    style={{ textAlign: col.align ?? "left" }}
                  >
                    {col.render(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
