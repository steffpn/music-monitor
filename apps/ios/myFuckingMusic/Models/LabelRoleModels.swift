import Foundation

// MARK: - Label Artist

/// An artist managed by the label.
/// Response item from GET /label/artists
struct LabelArtistSummary: Codable, Identifiable, Sendable {
    let id: Int
    let artistName: String
    let artistUserId: Int?
    let pictureUrl: String?
    let songCount: Int
    let totalPlays: Int
    let topSong: String?
    let addedAt: Date
}

// MARK: - Label Artist Song

/// A song belonging to an artist managed by the label.
/// Response item from GET /label/artists/:id/songs
struct LabelArtistSong: Codable, Identifiable, Sendable {
    let id: Int
    let songTitle: String
    let artistName: String
    let isrc: String
    let isMonitored: Bool
    let totalPlays: Int
    let stationCount: Int
    let activatedAt: Date?
}

// MARK: - Label Dashboard

/// Response from GET /label/dashboard
struct LabelDashboardResponse: Codable, Sendable {
    let totalPlays: Int
    let artistSummaries: [LabelArtistDashboardItem]
    let catalogSongs: [LabelCatalogSong]
}

/// Artist summary row on the label dashboard.
struct LabelArtistDashboardItem: Codable, Identifiable, Sendable {
    let artistName: String
    let pictureUrl: String?
    let songCount: Int
    let totalPlays: Int
    let topSong: String?

    var id: String { artistName }
}

/// Catalog song row on the label dashboard.
struct LabelCatalogSong: Codable, Identifiable, Sendable {
    let songTitle: String
    let artistName: String
    let isrc: String
    let totalPlays: Int
    let stationCount: Int?
    let activatedAt: Date?

    // Extra fields from API that we ignore for Identifiable
    private enum CodingKeys: String, CodingKey {
        case songTitle, artistName, isrc, totalPlays, stationCount, activatedAt
    }

    var id: String { isrc }
}

// MARK: - Artist Comparison

/// Response from GET /label/comparison
struct ArtistComparisonResponse: Codable, Sendable {
    let artists: [ArtistTimeSeries]
}

/// Time series play data for a single artist.
struct ArtistTimeSeries: Codable, Identifiable, Sendable {
    let artistName: String
    let dailyPlays: [DayPlayCount]

    var id: String { artistName }
}

// MARK: - Station Affinity

/// Response item from GET /label/station-affinity
struct StationAffinityItem: Codable, Identifiable, Sendable {
    let stationId: Int
    let stationName: String
    let logoUrl: String?
    let labelPlays: Int
    let totalStationPlays: Int
    let affinityPercent: Double

    var id: Int { stationId }
}

// MARK: - Release Tracker

/// Response from GET /label/releases/:id/tracker
struct ReleaseTrackerResponse: Codable, Sendable {
    let song: ReleaseTrackerSong
    let dailyPlays: [DayPlayCount]
    let totalFirstWeek: Int
}

/// Song metadata for the release tracker.
struct ReleaseTrackerSong: Codable, Sendable {
    let songTitle: String
    let artistName: String
    let isrc: String
    let activatedAt: Date
}
