import UIKit
import UserNotifications

/// UIApplicationDelegate for APNS token registration and notification handling.
/// Wired into SwiftUI via @UIApplicationDelegateAdaptor in myFuckingMusicApp.
class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, @unchecked Sendable {

    // MARK: - UIApplicationDelegate

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    /// Called when APNS successfully registers and provides a device token.
    /// Converts the token to a hex string and sends it to the backend.
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let hexToken = deviceToken.map { String(format: "%02x", $0) }.joined()

        #if DEBUG
        let environment: String? = "sandbox"
        #else
        let environment: String? = "production"
        #endif

        Task {
            let _: EmptyResponse? = try? await APIClient.shared.request(
                .registerDeviceToken(token: hexToken, environment: environment)
            )
        }
    }

    /// Called when APNS registration fails.
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[AppDelegate] Failed to register for remote notifications: \(error)")
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Handle notification tap (user tapped a delivered notification).
    /// Posts a local NotificationCenter event for digest deep linking.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo

        guard let type = userInfo["type"] as? String,
              (type == "daily_digest" || type == "weekly_digest") else {
            return
        }

        let date = userInfo["date"] as? String ?? ""

        await MainActor.run {
            NotificationCenter.default.post(
                name: .digestNotificationTapped,
                object: nil,
                userInfo: ["type": type, "date": date]
            )
        }
    }

    /// Handle notification when app is in the foreground -- show banner.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        return [.banner, .sound, .badge]
    }
}

// MARK: - Notification Names

extension Notification.Name {
    /// Posted when user taps a digest push notification.
    /// userInfo contains "type" (daily_digest/weekly_digest) and "date" (YYYY-MM-DD).
    static let digestNotificationTapped = Notification.Name("digestNotificationTapped")
}
