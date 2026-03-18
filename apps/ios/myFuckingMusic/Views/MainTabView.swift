import SwiftUI

/// Main tab bar navigation.
/// Shown when user is authenticated.
/// Tabs: Dashboard, Detections, Settings.
struct MainTabView: View {
    init() {
        // Style the tab bar for the dark theme
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(Color.rbBackground)

        // Normal state
        appearance.stackedLayoutAppearance.normal.iconColor = UIColor(Color.rbTextTertiary)
        appearance.stackedLayoutAppearance.normal.titleTextAttributes = [
            .foregroundColor: UIColor(Color.rbTextTertiary)
        ]

        // Selected state
        appearance.stackedLayoutAppearance.selected.iconColor = UIColor(Color.rbAccent)
        appearance.stackedLayoutAppearance.selected.titleTextAttributes = [
            .foregroundColor: UIColor(Color.rbAccent)
        ]

        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }

    var body: some View {
        TabView {
            // Dashboard tab
            NavigationStack {
                DashboardView()
            }
            .tabItem {
                Label("Dashboard", systemImage: "waveform")
            }

            // Detections tab (includes SSE connection indicator and search)
            DetectionsView()
                .tabItem {
                    Label("Detections", systemImage: "antenna.radiowaves.left.and.right")
                }

            // Artists tab
            ArtistListView()
                .tabItem {
                    Label("Artists", systemImage: "person.2.fill")
                }

            // Settings tab
            NavigationStack {
                SettingsView()
            }
            .tabItem {
                Label("Settings", systemImage: "gearshape.fill")
            }
        }
        .tint(Color.rbAccent)
        .preferredColorScheme(.dark)
        .safeAreaInset(edge: .bottom) {
            NowPlayingBar()
        }
    }
}

#Preview {
    MainTabView()
        .environment(AuthManager())
}
