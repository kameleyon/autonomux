#!/usr/bin/env node
/**
 * autonomux preflight static-check engine.
 *
 * Ported from studio-zero. Catches the ~70% of recurring issues that
 * DON'T need an LLM: undefined CSS vars, banned-word leaks, raw rgba/hex
 * literals, duplicate `<main>` landmarks, `window.confirm` anti-pattern,
 * silent fetch failures, etc. Runs in under 2 seconds.
 *
 * Wired to `pnpm preflight` at root and gated in CI.
 *
 * autonomux-specific tuning vs studio-zero source:
 *   - Banned words list trimmed to autonomux brand voice §13.3 (PRD)
 *   - Brand colors validated against autonomux tokens (warm-only)
 *   - Path conventions: monorepo-aware (apps/web, apps/admin, packages/*)
 *   - settings-anchors check disabled until apps/web has settings UI
 *   - substantiation check disabled until marketing/claims-substantiation exists
 *
 * Reviewer subagents stay in the loop for the human-grade reasoning
 * checks (UX hierarchy, audience fit, FTC framing). They no longer
 * have to catch the mechanical stuff.
 *
 * Usage
 * -----
 *   node scripts/preflight.mjs           — run all checks
 *   node scripts/preflight.mjs --list    — list available checks
 *   node scripts/preflight.mjs --check=banned-words  — single check
 *   node scripts/preflight.mjs --quiet   — only print failures
 *
 * Exit codes
 * ----------
 *   0 — all checks passed (or only warnings)
 *   1 — at least one blocker
 *   2 — script error
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

// ─────────────────────────────────────────────────────────────────────
// Constants + paths

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const APPS_DIR = join(REPO_ROOT, "apps");
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const WEB_ROOT = join(APPS_DIR, "web");
const GLOBALS_CSS = join(WEB_ROOT, "app", "globals.css");
const TOKENS_CSS = join(WEB_ROOT, "styles", "tokens.css");

// Brand voice §13.3 (PRD) banned in customer-facing copy.
const BANNED_WORDS = [
  "platform",
  "unlock",
  "fastest",
  "simply",
  "best-in-class",
  "world-class",
  "revolutionary",
  "game-changing",
  "synergy",
  "leverage",
  "magical",
];

const BANNED_WORD_ALLOWLIST = new Set([
  // {file relative to REPO_ROOT}:{optional line number}
]);

const USER_FACING_GLOBS = [
  "apps/web/app/**/*.tsx",
  "apps/web/app/**/*.ts",
  "apps/web/components/**/*.tsx",
  "apps/admin/app/**/*.tsx",
  "apps/admin/components/**/*.tsx",
];

const TSX_GLOBS = [
  "apps/web/app/**/*.tsx",
  "apps/web/components/**/*.tsx",
  "apps/admin/app/**/*.tsx",
  "apps/admin/components/**/*.tsx",
];

const APP_AUTHED_GLOB = "apps/web/app/app/**/*.tsx";

// ─────────────────────────────────────────────────────────────────────
// Tiny utilities

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    if (entry.name === ".next") continue;
    if (entry.name === ".turbo") continue;
    if (entry.name === "dist") continue;
    if (entry.name === "build") continue;
    if (entry.name === "audits") continue;
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function matchesGlob(relPath, glob) {
  const pattern = glob
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "::STAR::")
    .replace(/\*/g, "[^/\\\\]*")
    .replace(/::STAR::/g, ".*");
  return new RegExp(`^${pattern}$`).test(relPath.replace(/\\/g, "/"));
}

function relRepo(absolute) {
  return relative(REPO_ROOT, absolute).replace(/\\/g, "/");
}

function pickFiles(allFiles, globs) {
  return allFiles.filter((f) => {
    const r = relRepo(f);
    return globs.some((g) => matchesGlob(r, g));
  });
}

function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  out = out.replace(/(^|[\s({[,;=])\/\/[^\n]*/g, (m, p1) => {
    return p1 + " ".repeat(m.length - p1.length);
  });
  return out;
}

function emit(check, severity, findings) {
  return { name: check, severity, findings };
}

function finding(file, line, message, snippet) {
  return {
    file: relRepo(file),
    line,
    message,
    snippet: snippet?.trim(),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Check 1: banned words

async function checkBannedWords({ files }) {
  const findings = [];
  const targets = pickFiles(files, USER_FACING_GLOBS);
  const wordRe = new RegExp(
    `\\b(${BANNED_WORDS.map((w) => w.replace(/\s+/g, "\\s+")).join("|")})\\b`,
    "gi",
  );

  for (const file of targets) {
    const rel = relRepo(file);
    if (BANNED_WORD_ALLOWLIST.has(rel)) continue;
    const src = await readFile(file, "utf8");
    const stripped = stripComments(src);
    const lines = stripped.split("\n");
    const originalLines = src.split("\n");
    lines.forEach((line, i) => {
      let match;
      wordRe.lastIndex = 0;
      while ((match = wordRe.exec(line)) !== null) {
        findings.push(
          finding(
            file,
            i + 1,
            `banned-word: '${match[1]}' in user-facing copy (PRD §13.3)`,
            originalLines[i],
          ),
        );
      }
    });
  }
  return emit("banned-words", "blocker", findings);
}

// ─────────────────────────────────────────────────────────────────────
// Check 2: undefined CSS vars

async function checkUndefinedCssVars({ files, tokens }) {
  const findings = [];
  const cssFiles = files.filter((f) => f.endsWith(".css"));
  const varRefRe = /var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,[^)]*)?\)/g;
  for (const file of cssFiles) {
    if (file === TOKENS_CSS) continue;
    const src = await readFile(file, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      let match;
      varRefRe.lastIndex = 0;
      while ((match = varRefRe.exec(line)) !== null) {
        const name = match[1];
        if (!tokens.has(name)) {
          findings.push(
            finding(
              file,
              i + 1,
              `undefined-css-var: var(${name}) — define in styles/tokens.css or remove`,
              line,
            ),
          );
        }
      }
    });
  }
  return emit("undefined-css-vars", "blocker", findings);
}

// ─────────────────────────────────────────────────────────────────────
// Check 3: raw hex / rgba literals

async function checkRawHexLiterals({ files }) {
  const findings = [];
  const rawRgbaInCssRe = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g;
  const hexInJsxAttrRe =
    /(?:background|color|borderColor|fill|stroke|stopColor)\s*:\s*['"]#[0-9a-fA-F]{3,8}/g;

  for (const file of files) {
    if (file === TOKENS_CSS) continue;
    if (file === fileURLToPath(import.meta.url)) continue;
    if (file.includes("audits/")) continue;

    const src = await readFile(file, "utf8");

    if (file.endsWith(".css")) {
      const stripped = src.replace(/\/\*[\s\S]*?\*\//g, (m) =>
        m.replace(/[^\n]/g, " "),
      );
      const lines = stripped.split("\n");
      const origLines = src.split("\n");
      lines.forEach((line, i) => {
        rawRgbaInCssRe.lastIndex = 0;
        if (rawRgbaInCssRe.test(line)) {
          findings.push(
            finding(
              file,
              i + 1,
              "raw-rgba-in-css: replace with rgba(var(--*-rgb), …) using a companion-RGB token",
              origLines[i],
            ),
          );
        }
      });
    }

    if (file.endsWith(".tsx")) {
      const stripped = stripComments(src);
      const lines = stripped.split("\n");
      const origLines = src.split("\n");
      lines.forEach((line, i) => {
        hexInJsxAttrRe.lastIndex = 0;
        if (hexInJsxAttrRe.test(line)) {
          findings.push(
            finding(
              file,
              i + 1,
              "raw-hex-in-jsx-style: use var(--token), not a hex literal",
              origLines[i],
            ),
          );
        }
      });
    }
  }
  return emit("raw-hex-literals", "blocker", findings);
}

// ─────────────────────────────────────────────────────────────────────
// Check 4: duplicate <main> landmarks (authed shell only)

async function checkDuplicateMain({ files }) {
  const findings = [];
  const targets = pickFiles(files, [APP_AUTHED_GLOB]);
  const mainRe = /<main(?:\s|>)/g;

  for (const file of targets) {
    const src = await readFile(file, "utf8");
    const stripped = stripComments(src);
    const lines = stripped.split("\n");
    const origLines = src.split("\n");
    lines.forEach((line, i) => {
      mainRe.lastIndex = 0;
      if (mainRe.test(line)) {
        findings.push(
          finding(
            file,
            i + 1,
            "duplicate-main: AppShell owns the single <main> landmark; use <div> here",
            origLines[i],
          ),
        );
      }
    });
  }
  return emit("duplicate-main", "blocker", findings);
}

// ─────────────────────────────────────────────────────────────────────
// Check 5: window.confirm / alert / prompt

async function checkNativeDialogs({ files }) {
  const findings = [];
  const targets = pickFiles(files, TSX_GLOBS);
  const dialogRe = /\bwindow\.(confirm|alert|prompt)\s*\(/g;

  for (const file of targets) {
    const src = await readFile(file, "utf8");
    const stripped = stripComments(src);
    const lines = stripped.split("\n");
    const origLines = src.split("\n");
    lines.forEach((line, i) => {
      dialogRe.lastIndex = 0;
      let m;
      while ((m = dialogRe.exec(line)) !== null) {
        findings.push(
          finding(
            file,
            i + 1,
            `native-dialog: window.${m[1]}() is suppressible + inaccessible — use <ConfirmDialog>`,
            origLines[i],
          ),
        );
      }
    });
  }
  return emit("native-dialogs", "blocker", findings);
}

// ─────────────────────────────────────────────────────────────────────
// Check 6: silent fetch failure

async function checkSilentFetch({ files }) {
  const findings = [];
  const targets = pickFiles(files, TSX_GLOBS);
  const fetchRe = /\bfetch\s*\(/;
  const okCheckRe = /\b\w+(?:Res|Response|res|response)\.ok\b|\bres\.ok\b/;
  const errorSetterRe = /set(?:Error|StartError|AttestError|FormError|Err)\b/;

  for (const file of targets) {
    const src = await readFile(file, "utf8");
    const stripped = stripComments(src);
    const lines = stripped.split("\n");
    const origLines = src.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (!fetchRe.test(lines[i])) continue;
      const window = lines
        .slice(i, Math.min(lines.length, i + 50))
        .join("\n");
      if (okCheckRe.test(window)) continue;
      if (errorSetterRe.test(window)) continue;
      if (
        !/\.json\s*\(\)/.test(window) &&
        !/await\s+res|await\s+response/.test(window)
      ) {
        continue;
      }
      const localWindow = lines
        .slice(Math.max(0, i - 5), Math.min(lines.length, i + 10))
        .join("\n");
      if (
        /cache:\s*['"]no-store['"]/.test(localWindow) &&
        /set(?:Snap|Status|Build|Run)\b/.test(localWindow)
      ) {
        continue;
      }
      findings.push(
        finding(
          file,
          i + 1,
          "silent-fetch: response parsed without `res.ok` check or error setter — UI may silently fail",
          origLines[i],
        ),
      );
    }
  }
  return emit("silent-fetch", "warning", findings);
}

// ─────────────────────────────────────────────────────────────────────
// Check 7: heading element passed as JSX prop

async function checkHeadingPropAbuse({ files }) {
  const findings = [];
  const targets = pickFiles(files, TSX_GLOBS);
  const propRe = /heading=\{[^}]*<h[1-6][\s>]/g;

  for (const file of targets) {
    const src = await readFile(file, "utf8");
    const stripped = stripComments(src);
    const lines = stripped.split("\n");
    const origLines = src.split("\n");
    lines.forEach((line, i) => {
      propRe.lastIndex = 0;
      if (propRe.test(line)) {
        findings.push(
          finding(
            file,
            i + 1,
            "heading-prop-abuse: passing <hN> as `heading={...}` likely wraps it in another heading — pass a string + headingLevel",
            origLines[i],
          ),
        );
      }
    });
  }
  return emit("heading-prop-abuse", "blocker", findings);
}

// ─────────────────────────────────────────────────────────────────────
// Check 8: ASCII apostrophe in JSX text (warning)

async function checkSmartQuotes({ files }) {
  const findings = [];
  const targets = pickFiles(files, TSX_GLOBS);
  const jsxApostropheRe =
    />[^<>{}]*?(?<![a-zA-Z])'(?:s|t|d|ll|re|ve|m)\b[^<>{}]*?</g;

  for (const file of targets) {
    const src = await readFile(file, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      jsxApostropheRe.lastIndex = 0;
      if (jsxApostropheRe.test(line)) {
        findings.push(
          finding(
            file,
            i + 1,
            "smart-quote: ASCII apostrophe in JSX text — use ’ or &rsquo; (brand voice §7)",
            line,
          ),
        );
      }
    });
  }
  return emit("smart-quotes", "warning", findings);
}

// ─────────────────────────────────────────────────────────────────────
// Setup + runtime

const CHECKS = [
  checkBannedWords,
  checkUndefinedCssVars,
  checkRawHexLiterals,
  checkDuplicateMain,
  checkNativeDialogs,
  checkSilentFetch,
  checkHeadingPropAbuse,
  checkSmartQuotes,
];

async function loadTokens() {
  try {
    const src = await readFile(TOKENS_CSS, "utf8");
    const tokens = new Set();
    const re = /(--[a-zA-Z0-9-]+)\s*:/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      tokens.add(m[1]);
    }
    return tokens;
  } catch {
    return new Set();
  }
}

function parseArgs(argv) {
  const args = { quiet: false, list: false, check: null };
  for (const a of argv.slice(2)) {
    if (a === "--quiet") args.quiet = true;
    else if (a === "--list") args.list = true;
    else if (a.startsWith("--check=")) args.check = a.slice("--check=".length);
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function printHelp() {
  process.stdout.write(`autonomux preflight static-check engine

Usage:
  pnpm preflight                       run all checks
  pnpm preflight -- --list             list available checks
  pnpm preflight -- --check=X          run a single check by name
  pnpm preflight -- --quiet            only print failures

Exit codes:
  0  all checks passed
  1  at least one blocker
  2  script error
`);
}

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function color(code, s) {
  return process.stdout.isTTY ? `${code}${s}${COLORS.reset}` : s;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.list) {
    process.stdout.write("Available checks:\n");
    for (const fn of CHECKS) {
      const name = fn.name
        .replace(/^check/, "")
        .replace(/([A-Z])/g, "-$1")
        .toLowerCase()
        .replace(/^-/, "");
      process.stdout.write(`  ${name}\n`);
    }
    process.exit(0);
  }

  const t0 = Date.now();
  const allFiles = [
    ...(await walk(APPS_DIR)),
    ...(await walk(PACKAGES_DIR)),
  ];
  const tokens = await loadTokens();

  let toRun = CHECKS;
  if (args.check) {
    const sought = args.check.toLowerCase().replace(/[-_]/g, "");
    toRun = CHECKS.filter((fn) => {
      const norm = fn.name
        .replace(/^check/, "")
        .toLowerCase()
        .replace(/[-_]/g, "");
      return norm === sought;
    });
    if (toRun.length === 0) {
      process.stderr.write(`unknown check: ${args.check}\n`);
      process.exit(2);
    }
  }

  const results = [];
  for (const fn of toRun) {
    const r = await fn({ files: allFiles, tokens });
    results.push(r);
  }

  let totalBlockers = 0;
  let totalWarnings = 0;
  for (const r of results) {
    const isBlocker = r.severity === "blocker";
    const count = r.findings.length;
    if (count === 0) {
      if (!args.quiet) {
        process.stdout.write(
          `${color(COLORS.green, "✓")} ${r.name} ${color(COLORS.dim, "(0 findings)")}\n`,
        );
      }
      continue;
    }
    if (isBlocker) totalBlockers += count;
    else totalWarnings += count;
    const label = isBlocker
      ? color(COLORS.red, "✗")
      : color(COLORS.yellow, "!");
    const sevLabel = isBlocker
      ? color(COLORS.red, "BLOCKER")
      : color(COLORS.yellow, "warning");
    process.stdout.write(
      `${label} ${color(COLORS.bold, r.name)} ${color(COLORS.dim, `(${count} ${sevLabel})`)}\n`,
    );
    for (const f of r.findings) {
      process.stdout.write(
        `   ${color(COLORS.dim, `${f.file}:${f.line}`)} — ${f.message}\n`,
      );
      if (f.snippet && !args.quiet) {
        process.stdout.write(
          `       ${color(COLORS.dim, f.snippet.slice(0, 100))}\n`,
        );
      }
    }
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  process.stdout.write(
    `\n${color(COLORS.dim, `preflight ran ${toRun.length} check${toRun.length === 1 ? "" : "s"} in ${dt}s`)}\n`,
  );
  if (totalBlockers > 0) {
    process.stdout.write(
      `${color(COLORS.red, `${totalBlockers} blocker${totalBlockers === 1 ? "" : "s"}`)}${
        totalWarnings > 0
          ? `, ${color(COLORS.yellow, `${totalWarnings} warning${totalWarnings === 1 ? "" : "s"}`)}`
          : ""
      }\n`,
    );
    process.exit(1);
  }
  if (totalWarnings > 0) {
    process.stdout.write(
      `${color(COLORS.yellow, `${totalWarnings} warning${totalWarnings === 1 ? "" : "s"}`)} (no blockers — preflight passes)\n`,
    );
  } else {
    process.stdout.write(`${color(COLORS.green, "all clear")}\n`);
  }
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`preflight error: ${err?.stack ?? err}\n`);
  process.exit(2);
});
