import SwiftUI

@main
struct AutonomuxApp: App {
    @StateObject private var supabase = SupabaseManager.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(supabase)
                .task { await supabase.observeAuth() }
        }
    }
}
