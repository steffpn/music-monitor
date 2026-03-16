import SwiftUI

@main
struct myFuckingMusicApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var authManager = AuthManager()
    @State private var audioPlayer = AudioPlayerManager()
    @State private var notificationManager = NotificationManager()

    /// Navigation state for digest deep linking from push notification tap.
    @State private var showDigestDetail = false
    @State private var digestType: String = "daily"
    @State private var digestDate: String = ""

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authManager)
                .environment(audioPlayer)
                .environment(notificationManager)
                .task {
                    // Configure APIClient with auth manager for 401 retry
                    await APIClient.shared.configure(authManager: authManager)

                    // Request notification permission after registration
                    if authManager.isAuthenticated {
                        await notificationManager.requestPermissionIfNeeded()
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .digestNotificationTapped)) { notification in
                    if let type = notification.userInfo?["type"] as? String,
                       let date = notification.userInfo?["date"] as? String {
                        digestType = type == "weekly_digest" ? "weekly" : "daily"
                        digestDate = date
                        showDigestDetail = true
                    }
                }
                .sheet(isPresented: $showDigestDetail) {
                    NavigationStack {
                        DigestDetailView(
                            type: digestType,
                            date: digestDate
                        )
                    }
                }
        }
    }
}
