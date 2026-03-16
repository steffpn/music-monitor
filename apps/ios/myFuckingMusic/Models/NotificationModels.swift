import Foundation

// MARK: - Notification Preferences

/// Represents the user's notification preferences from the backend.
struct NotificationPreferences: Codable, Sendable {
    let dailyDigestEnabled: Bool
    let weeklyDigestEnabled: Bool
}

/// Request body for updating notification preferences.
struct UpdatePreferencesRequest: Encodable, Sendable {
    let dailyDigestEnabled: Bool?
    let weeklyDigestEnabled: Bool?
}

// MARK: - Device Token

/// Request body for registering a device token with the backend.
struct RegisterDeviceTokenRequest: Encodable, Sendable {
    let token: String
    let environment: String?
}

/// Request body for deleting a device token from the backend.
struct DeleteDeviceTokenRequest: Encodable, Sendable {
    let token: String
}

// MARK: - Digest Detail

/// Detailed digest data returned when tapping a push notification.
struct DigestDetail: Codable, Sendable {
    let playCount: Int
    let topSong: TopItem?
    let topStation: TopItem?
    let weekOverWeekChange: Double?
    let newStationsCount: Int?
}

/// A top-ranked item (song or station) in a digest.
struct TopItem: Codable, Sendable {
    let title: String
    let artist: String?
    let name: String?
    let count: Int
}

// MARK: - Empty Response

/// Used for API calls that return no meaningful body (e.g., device token registration).
struct EmptyResponse: Decodable, Sendable {}
