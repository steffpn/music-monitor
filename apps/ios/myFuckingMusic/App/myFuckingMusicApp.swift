import SwiftUI

@main
struct myFuckingMusicApp: App {
    @State private var authManager = AuthManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authManager)
                .task {
                    // Configure APIClient with auth manager for 401 retry
                    await APIClient.shared.configure(authManager: authManager)
                }
        }
    }
}
