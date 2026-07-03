import Foundation

/// Public client config. The anon key is safe to ship in the app (RLS enforces
/// tenant isolation server-side) — see BUILD_GUIDE.md for where to get it.
enum Config {
    static let supabaseURL = URL(string: "https://tulflzqrlafufjwdehie.supabase.co")!

    /// Paste your NEXT_PUBLIC_SUPABASE_ANON_KEY here (Supabase dashboard →
    /// Project Settings → API → anon/public key). Same key the web app uses.
    static let supabaseAnonKey = "REPLACE_WITH_ANON_KEY"
}
