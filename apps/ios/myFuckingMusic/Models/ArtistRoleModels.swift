import Foundation

// MARK: - Monitored Song

/// A song being monitored for an artist user.
/// Response item from GET /artist/songs
struct MonitoredSong: Codable, Identifiable, Sendable {
    let id: Int
    let songTitle: String
    let artistName: String
    let isrc: String
    let activatedAt: Date
    let expiresAt: Date?
    let status: String  // "active", "expired", "pending"
    let totalPlays: Int?
    let stationCount: Int?
    let trend: SongTrend?
}

/// Trend data for a monitored song comparing week-over-week.
struct SongTrend: Codable, Sendable {
    let percentChange: Double
    let direction: String  // "up", "down", "flat"
    let thisWeek: Int?
    let lastWeek: Int?
}

// MARK: - Artist Dashboard

/// Response from GET /artist/dashboard
struct ArtistDashboardResponse: Codable, Sendable {
    let totalPlaysToday: Int
    let totalPlaysWeek: Int
    let mostPlayedSong: MostPlayedSongInfo?
}

/// Summary info for the most played song on the artist dashboard.
struct MostPlayedSongInfo: Codable, Sendable {
    let title: String
    let artist: String
    let plays: Int
}

// MARK: - Song Analytics

/// Partial song info returned by analytics endpoint.
struct AnalyticsSongInfo: Codable, Sendable {
    let id: Int
    let songTitle: String
    let artistName: String
    let isrc: String
    let activatedAt: Date
}

/// Response from GET /artist/songs/:id/analytics
struct SongAnalyticsResponse: Codable, Sendable {
    let song: AnalyticsSongInfo
    let dailyPlays: [DayPlayCount]
    let totalPlays: Int
    let stationCount: Int
}

/// A single day's play count used across artist and label analytics.
struct DayPlayCount: Codable, Identifiable, Sendable {
    let date: String
    let count: Int

    var id: String { date }

    /// Parse the date string into a Date.
    var parsedDate: Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: date)
    }
}

// MARK: - Station Breakdown

/// Response item from GET /artist/songs/:id/station-breakdown
struct StationBreakdownItem: Codable, Identifiable, Sendable {
    let stationId: Int
    let stationName: String
    let logoUrl: String?
    let playCount: Int

    var id: Int { stationId }
}

// MARK: - Hourly Heatmap

/// Response from GET /artist/songs/:id/hourly-heatmap
struct HourlyHeatmapResponse: Codable, Sendable {
    let matrix: [[Int]]  // 7 rows (days) x 24 cols (hours)
    let maxValue: Int
}

// MARK: - Peak Hours

/// Response item from GET /artist/songs/:id/peak-hours
struct PeakHourSlot: Codable, Identifiable, Sendable {
    let dayOfWeek: Int
    let hour: Int
    let plays: Int
    let label: String

    var id: String { "\(dayOfWeek)-\(hour)" }
}

// MARK: - Weekly Digest

/// Response from GET /artist/weekly-digest
struct WeeklyDigestResponse: Codable, Sendable {
    let songs: [SongDigestItem]
}

/// A song's weekly digest summary with week-over-week comparison.
struct SongDigestItem: Codable, Identifiable, Sendable {
    let songTitle: String
    let artistName: String
    let isrc: String
    let playsThisWeek: Int
    let playsLastWeek: Int
    let percentChange: Double
    let direction: String
    let newStations: [String]

    var id: String { isrc }
}
