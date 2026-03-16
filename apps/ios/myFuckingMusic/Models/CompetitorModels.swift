import Foundation

// MARK: - Watched Stations

/// A station the user is monitoring as a competitor.
/// Response item from GET /competitors/watched
struct WatchedStation: Codable, Sendable, Identifiable {
    let id: Int
    let stationId: Int
    let stationName: String
}

// MARK: - Competitor Summary

/// Card data for a competitor station in the list view.
/// Response item from GET /competitors/summary
struct CompetitorCard: Codable, Sendable, Identifiable {
    let stationId: Int
    let stationName: String
    let playCount: Int
    let topSong: CompetitorTopSong?

    var id: Int { stationId }
}

/// Top song preview shown on a competitor card.
struct CompetitorTopSong: Codable, Sendable {
    let title: String
    let artist: String
}

// MARK: - Competitor Detail

/// Full detail for a single competitor station.
/// Response from GET /competitors/:stationId/detail
struct CompetitorDetail: Codable, Sendable {
    let topSongs: [CompetitorSong]
    let recentDetections: [CompetitorDetection]
    let comparison: [CompetitorComparison]
}

/// A song detected on a competitor station with play count.
struct CompetitorSong: Codable, Sendable, Identifiable {
    let title: String
    let artist: String
    let isrc: String?
    let playCount: Int

    var id: String { "\(title)-\(artist)-\(isrc ?? "")" }
}

/// A single detection event on a competitor station.
struct CompetitorDetection: Codable, Sendable, Identifiable {
    let id: Int
    let songTitle: String
    let artistName: String
    let startedAt: String
}

/// Play count comparison between competitor and user's station.
struct CompetitorComparison: Codable, Sendable, Identifiable {
    let songTitle: String
    let artistName: String
    let theirPlays: Int
    let yourPlays: Int

    var id: String { "\(songTitle)-\(artistName)" }
}

// MARK: - Request Bodies

/// Request body for POST /competitors/watched
struct AddWatchedStationRequest: Encodable {
    let stationId: Int
}
