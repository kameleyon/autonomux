/**
 * AdminPagination — server-side page nav.
 *
 * Renders Prev/Next anchors that preserve the existing search params and
 * bump the `page` param. Uses real <a> elements so JS is optional.
 */
import Link from "next/link";

import type React from "react";

export interface AdminPaginationProps {
  /** Base path (page route). */
  pathname: string;
  /** Current page (1-indexed). */
  page: number;
  /** Page size — used only for the position label. */
  pageSize: number;
  /** Rows on the current page (used to decide whether "Next" is enabled). */
  rowsOnPage: number;
  /** Total row count, if known. When undefined we fall back to "more / no more". */
  totalRows?: number;
  /**
   * Existing search params (sans `page`) — Forward them so filters are preserved
   * when the user pages.
   */
  searchParams: Readonly<Record<string, string | string[] | undefined>>;
}

function buildHref(
  pathname: string,
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
  nextPage: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page" || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  if (nextPage > 1) params.set("page", String(nextPage));
  const qs = params.toString();
  return qs.length > 0 ? `${pathname}?${qs}` : pathname;
}

export function AdminPagination({
  pathname,
  page,
  pageSize,
  rowsOnPage,
  totalRows,
  searchParams,
}: AdminPaginationProps): React.ReactElement {
  const start = (page - 1) * pageSize + 1;
  const end = (page - 1) * pageSize + rowsOnPage;

  const hasPrev = page > 1;
  // If totalRows known, use it; otherwise treat a full page as "maybe more".
  const hasNext =
    typeof totalRows === "number"
      ? end < totalRows
      : rowsOnPage >= pageSize;

  return (
    <nav
      className="adm-pagination"
      aria-label="Pagination"
    >
      <p className="adm-pagination__status" aria-live="polite">
        {rowsOnPage === 0
          ? "No results"
          : typeof totalRows === "number"
            ? `Showing ${start}–${end} of ${totalRows}`
            : `Showing ${start}–${end}`}
      </p>
      <div className="adm-pagination__nav">
        {hasPrev ? (
          <Link
            className="adm-pagination__btn"
            href={buildHref(pathname, searchParams, page - 1)}
            rel="prev"
          >
            ← Previous
          </Link>
        ) : (
          <span
            className="adm-pagination__btn"
            aria-disabled="true"
          >
            ← Previous
          </span>
        )}
        {hasNext ? (
          <Link
            className="adm-pagination__btn"
            href={buildHref(pathname, searchParams, page + 1)}
            rel="next"
          >
            Next →
          </Link>
        ) : (
          <span
            className="adm-pagination__btn"
            aria-disabled="true"
          >
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
