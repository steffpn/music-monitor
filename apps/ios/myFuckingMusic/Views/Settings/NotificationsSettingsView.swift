import SwiftUI

/// Notification preferences view with daily/weekly digest toggles.
/// Shows a warning hint when push permissions are denied.
struct NotificationsSettingsView: View {
    @State private var viewModel = NotificationsViewModel()
    @Environment(NotificationManager.self) private var notificationManager

    var body: some View {
        @Bindable var viewModel = viewModel

        List {
            // Digest toggles
            Section {
                Toggle("Daily Digest", isOn: $viewModel.dailyDigestEnabled)
                    .onChange(of: viewModel.dailyDigestEnabled) {
                        Task { await viewModel.updatePreferences() }
                    }

                Toggle("Weekly Digest", isOn: $viewModel.weeklyDigestEnabled)
                    .onChange(of: viewModel.weeklyDigestEnabled) {
                        Task { await viewModel.updatePreferences() }
                    }
            } header: {
                Text("Notifications")
            } footer: {
                Text("Digests are sent at 9:00 AM Romania time.")
            }

            // Permission denied hint
            if notificationManager.pushPermissionDenied {
                Section {
                    Label {
                        Text("Push notifications are disabled. Enable them in iOS Settings to receive digests.")
                            .font(.subheadline)
                    } icon: {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                }
            }

            // Error display
            if let error = viewModel.error {
                Section {
                    Text(error)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }
        }
        .navigationTitle("Notifications")
        .task {
            await viewModel.loadPreferences()
            await notificationManager.checkPermissionStatus()
        }
    }
}

#Preview {
    NavigationStack {
        NotificationsSettingsView()
            .environment(NotificationManager())
    }
}
