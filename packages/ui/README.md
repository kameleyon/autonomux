# @autonomux/ui

Shared UI primitives for autonomux. Warm-only palette. WCAG 2.2 AA on every primitive.

**Owned by [Vega + Halo]** (design system + accessibility).

---

## Usage

```ts
// In your app root (e.g. apps/web/app/layout.tsx)
import "@autonomux/ui/tokens.css";

// Per-primitive styles (or bundle them at build time)
import "@autonomux/ui/Button.css";
import "@autonomux/ui/Card.css";
// …

// Import primitives
import { Button, Card, Field, Form, Input, Dialog } from "@autonomux/ui";
```

All primitives are server-component-friendly **except** `Dialog`, `Nav`, `Form`, `Field`, and `Input` (these mark `"use client"` because they use React state / refs).

---

## Tokens

The package ships a copy of the canonical token file at `@autonomux/ui/tokens.css`. It mirrors `apps/web/styles/tokens.css` — the single source of truth. **No hex literals anywhere in primitives.** All colors are `var(--*)`.

Brand rule (PRD §13): warm-only palette (red · orange · gold · yellow). No greens, blues, purples. Even "destructive" uses `--brand-wine`.

---

## Primitives

### `Button`

```tsx
<Button variant="primary" size="md" onClick={handle}>Save</Button>
<Button as="a" href="/billing" variant="secondary">Manage billing</Button>
<Button variant="destructive" loading>Deleting…</Button>
```

**Variants:** `primary` (chameleon orange) · `secondary` (outline) · `ghost` · `destructive` (`--brand-wine`).
**Sizes:** `sm` (≥24px) · `md` (≥44px) · `lg` (≥48px).
**Polymorphism:** `as="a"` + `href` renders an anchor.

**A11y:**
- Focus-visible: 2px solid `--focus-ring`, 2px offset (SC 2.4.13).
- Hit target ≥44×44 at `md`/`lg` (SC 2.5.8). `sm` is for inline dense use only.
- Icon-only buttons MUST pass `aria-label`.
- `loading` sets `aria-busy` + `disabled`.
- Spinner respects `prefers-reduced-motion`.

---

### `Card`

```tsx
<Card padding="md" variant="warm">…</Card>
<Card as="article" padding="lg">…</Card>
<Card href="/agent/scribe" padding="md">…</Card>  // becomes <a>
```

**Variants:** `default` · `warm` · `bordered`.
**Padding:** `sm` · `md` · `lg`.

**A11y:**
- Card with `href` becomes a single full-area link with focus-visible.
- Card without `href` has no role / no click behavior.
- Caller picks the tag with `as` for `<article>` / `<section>` / `<div>` semantics.

---

### `Form` + `Field`

```tsx
<Form onSubmit={onSubmit} errorSummary={errors}>
  <Field label="Email" helpText="Used for your morning briefing." required>
    <Input variant="email" name="email" />
  </Field>
  <Field label="Password" errorText={errors.password}>
    <Input variant="password" name="password" />
  </Field>
  <Button type="submit">Sign in</Button>
</Form>
```

**A11y:**
- `Form` renders `<form noValidate>` by default + injects an error summary region with `role="alert"` + `tabIndex=-1` so you can `.focus()` it after submit (SC 3.3.1).
- `Field` auto-generates an `id` via `useId()` and binds `<label htmlFor>` to the wrapped control. It also injects `aria-describedby` for `helpText` + `errorText`, and `aria-invalid` when errored.
- Error renders as `<p role="alert">` — announced on appearance.

---

### `Input`

```tsx
<Input variant="text" name="name" />
<Input variant="email" name="email" />
<Input variant="password" name="password" />
<Input variant="number" name="amount" inputMode="decimal" />
```

**A11y:**
- Min-height 44px (SC 2.5.8).
- Border `--border-strong` (≥3:1 contrast vs `--brand-white`, SC 1.4.11).
- Focus token (SC 2.4.13).
- Password variant: real `<button>` toggle with `aria-pressed` + dynamic `aria-label`. Hit target ≥44×44.

---

### `Select`

```tsx
<Select variant="standard" name="timezone">
  <option value="America/New_York">Eastern</option>
  …
</Select>
```

**A11y:**
- Native `<select>` — SR, mobile, keyboard work for free (no fake dropdown).
- Min-height 44px (SC 2.5.8).
- Border `--border-strong` (SC 1.4.11).
- `mono` variant uses DM Mono for data-shaped values.

---

### `Dialog`

```tsx
<Dialog
  open={open}
  onClose={() => setOpen(false)}
  title="Cancel briefing?"
  description="Your AlterEgo won't run tomorrow's morning brief."
  role="alertdialog"
>
  <Button variant="destructive" onClick={confirm}>Yes, cancel</Button>
  <Button variant="secondary" onClick={() => setOpen(false)}>Keep it</Button>
</Dialog>
```

**A11y (APG modal dialog pattern):**
- Backdrop is a real `<button tabIndex={-1} aria-hidden>` (not a div+onClick). SR ignores it.
- Panel has `role="dialog"` or `role="alertdialog"` + `aria-modal="true"`.
- `aria-labelledby` → title; `aria-describedby` → description.
- ESC closes; focus is trapped inside the panel; focus returns to the opener on close.
- Replaces `window.confirm/alert/prompt` — those are flagged by `scripts/preflight.mjs`.

---

### `Chip`

```tsx
<Chip variant="mono-meta">07:43 ET</Chip>
<Chip variant="push">PUSH</Chip>
<Chip variant="pitch">PITCH</Chip>
<Chip variant="pause">PAUSE</Chip>
<Chip variant="save">SAVE</Chip>
```

**Variants:** `mono-meta` (DM Mono uppercase) + warm-only PPPS severity.

**A11y:** pass `asStatus` for `role="status"` if the chip text changes dynamically.

---

### `SkipLink`

```tsx
<SkipLink href="#main" />
```

**A11y:** SC 2.4.1 Bypass Blocks. MUST be the first focusable element in the document. Pair with `<main id="main" tabIndex={-1}>`.

---

### `Nav`

```tsx
<Nav
  brand={<Logo />}
  brandHref="/"
  links={[
    { href: "/", label: "Home" },
    { href: "/pricing", label: "Pricing" },
    { href: "/security", label: "Security" },
  ]}
  authState="signed-out"
  authSlot={<Button as="a" href="/signup" size="sm">Get my AlterEgo</Button>}
/>
```

**A11y:**
- `<nav aria-label="Primary">` landmark (SC 2.4.6).
- `aria-current="page"` on active link, computed client-side from `window.location.pathname` after mount (SSR-stable).
- Mobile drawer ≤880px: toggle has `aria-expanded` + `aria-controls`. Drawer traps focus + closes on ESC + returns focus to the toggle.

---

### `Footer`

```tsx
<Footer
  columns={[
    { heading: "Product", links: [
      { href: "/agents", label: "Agents" },
      { href: "/pricing", label: "Pricing" },
    ]},
    { heading: "Legal", links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ]},
  ]}
  version="0.1.0"
  brandName="autonomux"
/>
```

**A11y:**
- `<footer aria-label="Site">` landmark.
- Each column is a `<nav>` with `aria-labelledby` → column heading.
- External links get `target=_blank rel=noopener` + an `sz-sr-only` "(opens in a new tab)" suffix.

---

### `EmptyState`

```tsx
<EmptyState
  eyebrow="No briefings yet"
  heading="Your AlterEgo is still warming up."
  headingLevel={2}
  body="It takes about 24 hours after you connect your first integration."
  primaryCta={{ label: "Connect Gmail", href: "/integrations" }}
  secondaryCta={{ label: "Learn more", href: "/how-it-works" }}
/>
```

**Critical:** `heading` is a **string** (not `ReactNode`). Caller controls the level via `headingLevel`. This prevents the studio-zero regression where a caller passed `<h2>...</h2>` and we re-wrapped it in another heading. `scripts/preflight.mjs` `heading-prop-abuse` blocks that pattern.

---

## Constraints

- **Warm-only:** no green / blue / purple anywhere. Success states use `--brand-red-deep` or `--brand-amber`.
- **Focus:** every interactive primitive has a 2px / 3:1 focus-visible outline (SC 2.4.13).
- **Reflow:** every primitive is usable at 320px width (SC 1.4.10).
- **No window.confirm/alert/prompt:** preflight blocks. Use `Dialog`.
- **No hex literals:** use tokens. Preflight blocks raw hex in JSX `style={{}}` and raw rgba in CSS.
- **Reduced motion:** every animation respects `prefers-reduced-motion: reduce`.
- **Strict TS:** all primitives are typed; exports are named (no `default`).
