import Foundation
import UserNotifications
import UIKit

/// Manages push notification permissions and status tracking.
/// Injected via .environment() at the app root.
@MainActor
@Observable
final class NotificationManager {
    /// Whether push notification permission has been granted.
    var pushPermissionGranted: Bool = false

    /// Whether push notification permission has been explicitly denied.
    var pushPermissionDenied: Bool = false

    // MARK: - Permission Management

    /// Request push notification permission from the user.
    /// If granted, registers for remote notifications with APNS.
    func requestPermission() async {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            pushPermissionGranted = granted
            pushPermissionDenied = !granted
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
            }
        } catch {
            print("[NotificationManager] Permission request failed: \(error)")
            pushPermissionDenied = true
        }
    }

    /// Check the current notification permission status and update properties.
    func checkPermissionStatus() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            pushPermissionGranted = true
            pushPermissionDenied = false
        case .denied:
            pushPermissionGranted = false
            pushPermissionDenied = true
        case .notDetermined:
            pushPermissionGranted = false
            pushPermissionDenied = false
        @unknown default:
            pushPermissionGranted = false
            pushPermissionDenied = false
        }
    }

    /// Request permission only if not yet determined.
    /// Called on first launch after successful registration.
    func requestPermissionIfNeeded() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            await requestPermission()
        } else {
            await checkPermissionStatus()
        }
    }
}
