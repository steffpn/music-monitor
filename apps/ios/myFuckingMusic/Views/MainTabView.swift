import SwiftUI

/// Main tab bar navigation.
/// Shown when user is authenticated.
/// Tabs: Dashboard, Detections, Search, Settings.
struct MainTabView: View {
    var body: some View {
        TabView {
            // Dashboard tab
            NavigationStack {
                Text("Dashboard")
                    .font(.title)
                    .foregroundStyle(.secondary)
                    .navigationTitle("Dashboard")
            }
            .tabItem {
                Label("Dashboard", systemImage: "house.fill")
            }

            // Detections tab
            NavigationStack {
                Text("Detections")
                    .font(.title)
                    .foregroundStyle(.secondary)
                    .navigationTitle("Detections")
            }
            .tabItem {
                Label("Detections", systemImage: "list.bullet")
            }

            // Search tab
            NavigationStack {
                Text("Search")
                    .font(.title)
                    .foregroundStyle(.secondary)
                    .navigationTitle("Search")
            }
            .tabItem {
                Label("Search", systemImage: "magnifyingglass")
            }

            // Settings tab
            NavigationStack {
                SettingsView()
            }
            .tabItem {
                Label("Settings", systemImage: "gear")
            }
        }
    }
}

#Preview {
    MainTabView()
        .environment(AuthManager())
}
