"use client";

/**
 * JsonPreview — collapsible JSON block with copy-to-clipboard.
 *
 * Uses native <details>/<summary> for collapse so it works without JS;
 * client-side copy button enhances on hydration.
 *
 * Why client: navigator.clipboard requires user-gesture in browser.
 *
 * Owner: [Forge + Vega]
 */
import { useId, useState } from "react";

export interface JsonPreviewProps {
  /** Arbitrary serializable value. */
  value: unknown;
  /** Short label shown on the collapsed summary (e.g. "metadata"). */
  label?: string;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function previewLine(value: unknown): string {
  const flat = safeStringify(value).replace(/\s+/g, " ");
  return flat.length > 48 ? `${flat.slice(0, 48)}…` : flat;
}

export function JsonPreview({
  value,
  label = "JSON",
}: JsonPreviewProps): React.ReactElement {
  const bodyId = useId();
  const [copied, setCopied] = useState<"idle" | "ok" | "err">("idle");

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(safeStringify(value));
      setCopied("ok");
    } catch {
      setCopied("err");
    }
    setTimeout(() => setCopied("idle"), 2000);
  }

  return (
    <details className="adm-json">
      <summary className="adm-json__summary" aria-controls={bodyId}>
        <span aria-hidden="true">▸</span>
        <span>
          {label}: {previewLine(value)}
        </span>
      </summary>
      <pre id={bodyId} className="adm-json__body">
        {safeStringify(value)}
      </pre>
      <button
        type="button"
        className="adm-json__copy"
        onClick={() => {
          void handleCopy();
        }}
        aria-live="polite"
      >
        {copied === "ok"
          ? "Copied"
          : copied === "err"
            ? "Copy failed"
            : "Copy"}
      </button>
    </details>
  );
}
