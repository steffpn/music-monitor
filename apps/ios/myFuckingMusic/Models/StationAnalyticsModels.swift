import Foundation

// MARK: - Station Overview

/// Response from GET /station/overview
struct StationOverviewResponse: Codable, Sendable {
    let totalPlays: Int
    let uniqueSongs: Int
    let uniqueArtists: Int
    let stationNames: [String]?
}

// MARK: - Top Songs

/// Response item from GET /station/top-songs
struct StationTopSong: Codable, Identifiable, Sendable {
    let rank: Int
    let songTitle: String
    let artistName: String
    let isrc: String?
    let playCount: Int

    var id: Int { rank }
}

// MARK: - New Songs

/// Response item from GET /station/new-songs
struct NewSongItem: Codable, Identifiable, Sendable {
    let songTitle: String
    let artistName: String
    let isrc: String?
    let firstPlayedAt: Date

    var id: String { "\(songTitle)-\(artistName)" }
}

// MARK: - Exclusive Songs

/// Response item from GET /station/exclusive-songs
struct ExclusiveSongItem: Codable, Identifiable, Sendable {
    let songTitle: String
    let artistName: String
    let isrc: String?
    let playCount: Int

    var id: String { "\(songTitle)-\(artistName)" }
}

// MARK: - Playlist Overlap

/// Response from GET /station/overlap/:competitorId
struct PlaylistOverlapResponse: Codable, Sendable {
    let overlapPercent: Double
    let sharedCount: Int
    let exclusiveToYou: Int
    let exclusiveToThem: Int
    let sharedSongs: [SharedSongItem]
}

/// A song shared between two stations in the overlap analysis.
struct SharedSongItem: Codable, Identifiable, Sendable {
    let songTitle: String
    let artistName: String
    let yourPlays: Int
    let theirPlays: Int

    var id: String { "\(songTitle)-\(artistName)" }
}

// MARK: - Genre Distribution

/// Response item from GET /station/genre-distribution
struct GenreDistributionItem: Codable, Identifiable, Sendable {
    let label: String
    let playCount: Int
    let percentage: Double

    var id: String { label }
}

// MARK: - Rotation Analysis

/// Response from GET /station/rotation
struct RotationAnalysisResponse: Codable, Sendable {
    let uniqueSongsPerHour: [HourBucket]
    let averageRotation: Double
    let overRotatedSongs: [OverRotatedSong]
}

/// A single hour bucket for rotation analysis.
struct HourBucket: Codable, Identifiable, Sendable {
    let hour: Int
    let count: Int

    var id: Int { hour }
}

/// A song that is over-rotated relative to expected maximum.
struct OverRotatedSong: Codable, Identifiable, Sendable {
    let songTitle: String
    let artistName: String
    let playCount: Int
    let expectedMax: Int

    var id: String { "\(songTitle)-\(artistName)" }
}

// MARK: - Discovery Score

/// Response from GET /station/discovery-score
struct DiscoveryScoreResponse: Codable, Sendable {
    let score: Double
    let newSongsCount: Int
    let totalSongsCount: Int
    let newSongsPlays: Int
    let totalPlays: Int
}
