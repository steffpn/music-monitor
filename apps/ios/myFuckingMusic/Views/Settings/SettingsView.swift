import SwiftUI

/// Settings tab showing user info and logout button.
struct SettingsView: View {
    @Environment(AuthManager.self) private var authManager

    @State private var isLoggingOut = false

    var body: some View {
        List {
            // User info section
            Section("Account") {
                if let user = authManager.currentUser {
                    HStack {
                        Text("Name")
                        Spacer()
                        Text(user.name)
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Text("Email")
                        Spacer()
                        Text(user.email)
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Text("Role")
                        Spacer()
                        Text(user.role.capitalized)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text("Not signed in")
                        .foregroundStyle(.secondary)
                }
            }

            // App info section
            Section("App") {
                HStack {
                    Text("Version")
                    Spacer()
                    Text("1.0")
                        .foregroundStyle(.secondary)
                }
            }

            // Logout section
            Section {
                Button(role: .destructive) {
                    isLoggingOut = true
                    Task {
                        await authManager.logout()
                        isLoggingOut = false
                    }
                } label: {
                    HStack {
                        Spacer()
                        if isLoggingOut {
                            ProgressView()
                        } else {
                            Text("Log Out")
                        }
                        Spacer()
                    }
                }
                .disabled(isLoggingOut)
            }
        }
        .navigationTitle("Settings")
    }
}

#Preview {
    NavigationStack {
        SettingsView()
            .environment(AuthManager())
    }
}
