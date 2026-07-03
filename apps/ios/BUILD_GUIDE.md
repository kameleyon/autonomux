# autonomux — iOS app (Swift / SwiftUI)

Native iOS client for autonomux, sharing the **same Supabase backend, accounts,
and RLS** as the web app. This is authored on Windows but **can only be built on
a Mac** (Apple toolchain requirement).

> If your editor shows `No such module 'SwiftUI'` / `'Supabase'` on Windows —
> that's expected. Those SDKs exist only in the iOS toolchain on macOS; the
> warnings disappear in Xcode.

## Prerequisites (on a Mac)

- **macOS** with **Xcode 15+** (from the App Store).
- **XcodeGen** — generates the `.xcodeproj` from `project.yml`:
  ```sh
  brew install xcodegen
  ```

## Build & run

```sh
cd apps/ios

# 1. Paste your Supabase anon key into Sources/Core/Config.swift
#    (Supabase dashboard → Project Settings → API → anon/public key —
#     the SAME key as NEXT_PUBLIC_SUPABASE_ANON_KEY in the web app).

# 2. Generate the Xcode project + resolve the Supabase Swift package
xcodegen generate

# 3. Open and run (⌘R) on a simulator or device
open Autonomux.xcodeproj
```

First launch shows the **sign-in** screen. Sign in with an existing autonomux
account (same as web) and you land on the **AlterEgo home**. Log out from the
top-right icon.

## What's in this foundation

| Area | File |
|---|---|
| App entry + routing | `Sources/App/AutonomuxApp.swift`, `RootView.swift` |
| Supabase session (shared backend) | `Sources/Core/SupabaseManager.swift`, `Config.swift` |
| Brand tokens (warm palette, fonts) | `Sources/Core/Theme.swift` |
| Sign in / sign up | `Sources/Auth/SignInView.swift` |
| AlterEgo home + skill cards | `Sources/Home/HomeView.swift` |

All views use SwiftUI's adaptive layout, so they're responsive across iPhone and
iPad out of the box.

## Fonts (optional, for exact brand)

The theme references **Cormorant Garamond**, **Inter**, and **DM Mono**. Until
you bundle them, iOS falls back to the system font (no crash). To ship the exact
look: add the `.ttf` files to `Sources/Fonts/`, list them under
`UIAppFonts` in `project.yml`, then `xcodegen generate` again.

## Not built yet (next agents fan out here)

- Chat thread + streaming replies (wired to the web `/api/chat` backend)
- Treasurer / finance views (Plaid connect, balances, bills, insights)
- Notifications (APNs push)
- Passkey / TOTP 2FA sign-in (matching web)
