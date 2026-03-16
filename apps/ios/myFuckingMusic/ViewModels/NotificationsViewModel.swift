import Foundation

/// ViewModel for notification preferences management.
/// Loads and saves daily/weekly digest preferences to the backend API.
@MainActor
@Observable
final class NotificationsViewModel {
    var dailyDigestEnabled: Bool = true
    var weeklyDigestEnabled: Bool = true
    var isLoading: Bool = false
    var error: String?

    /// Fetch current notification preferences from the backend.
    func loadPreferences() async {
        isLoading = true
        error = nil
        do {
            let prefs: NotificationPreferences = try await APIClient.shared.request(
                .notificationPreferences
            )
            dailyDigestEnabled = prefs.dailyDigestEnabled
            weeklyDigestEnabled = prefs.weeklyDigestEnabled
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    /// Save current toggle values to the backend.
    /// Fire-and-forget: UI updates immediately, syncs in background.
    /// On error, reverts toggles and shows error message.
    func updatePreferences() async {
        let previousDaily = dailyDigestEnabled
        let previousWeekly = weeklyDigestEnabled
        do {
            let _: EmptyResponse = try await APIClient.shared.request(
                .updateNotificationPreferences(
                    daily: dailyDigestEnabled,
                    weekly: weeklyDigestEnabled
                )
            )
        } catch {
            // Revert on failure
            dailyDigestEnabled = previousDaily
            weeklyDigestEnabled = previousWeekly
            self.error = "Failed to save preferences"
        }
    }
}
