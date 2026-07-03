import SwiftUI

/// Switches the whole app between the sign-in flow and the signed-in home,
/// driven purely by the Supabase session. Same gate as the web middleware.
struct RootView: View {
    @EnvironmentObject private var supabase: SupabaseManager

    var body: some View {
        Group {
            if supabase.isBootstrapping {
                LoadingView()
            } else if supabase.isAuthenticated {
                HomeView()
            } else {
                SignInView()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: supabase.isAuthenticated)
        .animation(.easeInOut(duration: 0.25), value: supabase.isBootstrapping)
    }
}

private struct LoadingView: View {
    var body: some View {
        ZStack {
            Brand.cream.ignoresSafeArea()
            ProgressView().tint(Brand.orange)
        }
    }
}
