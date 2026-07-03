import Foundation
import Supabase

/// Single source of truth for the Supabase session. Observes auth state so the
/// UI switches between the sign-in flow and the app automatically. Reuses the
/// SAME backend, accounts, and RLS as the web app.
@MainActor
final class SupabaseManager: ObservableObject {
    static let shared = SupabaseManager()

    let client: SupabaseClient

    @Published private(set) var session: Session?
    @Published private(set) var isBootstrapping = true

    var isAuthenticated: Bool { session != nil }

    private init() {
        client = SupabaseClient(
            supabaseURL: Config.supabaseURL,
            supabaseKey: Config.supabaseAnonKey
        )
    }

    /// Long-lived observer — restores a stored session on launch and reacts to
    /// sign-in / sign-out. Call once from the app's root `.task`.
    func observeAuth() async {
        for await state in client.auth.authStateChanges {
            session = state.session
            switch state.event {
            case .initialSession, .signedIn, .signedOut, .tokenRefreshed, .userUpdated:
                isBootstrapping = false
            default:
                break
            }
        }
    }

    func signIn(email: String, password: String) async throws {
        try await client.auth.signIn(email: email, password: password)
    }

    func signUp(email: String, password: String) async throws {
        try await client.auth.signUp(email: email, password: password)
    }

    func signOut() async {
        try? await client.auth.signOut()
    }
}
