import Foundation

/// Mirrors `DetectionEvent` from packages/shared/src/types/detection.ts
struct Detection: Codable, Identifiable, Sendable {
    let id: Int
    let stationId: Int
    let detectedAt: Date
    let songTitle: String
    let artistName: String
    let albumTitle: String?
    let isrc: String?
    let confidence: Double
    let durationMs: Int
    let rawCallbackId: String?
    let createdAt: Date
}

/// Mirrors `AirplayEvent` from packages/shared/src/types/detection.ts
struct AirplayEvent: Codable, Identifiable, Sendable {
    let id: Int
    let stationId: Int
    let startedAt: Date
    let endedAt: Date
    let songTitle: String
    let artistName: String
    let isrc: String?
    let playCount: Int
    let snippetUrl: String?
    let createdAt: Date

    /// Nested station info included by the airplay-events API.
    let station: StationInfo?

    /// Lightweight station name included in airplay event responses.
    struct StationInfo: Codable, Sendable {
        let name: String
    }
}
