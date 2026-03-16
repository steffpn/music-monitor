import SwiftUI

/// Auth-gated root view.
/// Shows MainTabView when authenticated, auth flow when not.
struct ContentView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var authViewModel = AuthViewModel()

    var body: some View {
        Group {
            if authManager.isLoading {
                // Loading state while checking stored tokens
                VStack(spacing: 16) {
                    ProgressView()
                    Text("Loading...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else if authManager.isAuthenticated {
                MainTabView()
            } else {
                NavigationStack {
                    WelcomeView()
                }
                .environment(authViewModel)
            }
        }
        .task {
            // Configure view model with auth manager
            authViewModel.configure(authManager: authManager)

            // Check stored tokens on app launch
            await authManager.checkStoredTokens()
        }
    }
}

#Preview {
    ContentView()
        .environment(AuthManager())
}
