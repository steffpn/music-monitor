import Foundation

enum APIEndpoint: Sendable {
    // Health
    case health

    // Auth
    case register(code: String, email: String, password: String, name: String)
    case login(email: String, password: String)
    case refresh(refreshToken: String)
    case logout(refreshToken: String)

    // Dashboard
    case dashboardSummary(period: String)
    case topStations(period: String, limit: Int)

    // Airplay Events
    case airplayEvents(cursor: Int?, limit: Int, query: String?,
                       startDate: String?, endDate: String?, stationId: Int?)
    case snippetUrl(eventId: Int)

    // Stations
    case stations

    // Competitors
    case watchedStations
    case addWatchedStation(stationId: Int)
    case removeWatchedStation(stationId: Int)
    case competitorSummary(period: String)
    case competitorDetail(stationId: Int, period: String)

    // Exports
    case exportCSV(query: String?, startDate: String?, endDate: String?, stationId: Int?)
    case exportPDF(startDate: String, endDate: String, query: String?, stationId: Int?)

    // Notifications
    case notificationPreferences
    case updateNotificationPreferences(daily: Bool?, weekly: Bool?)
    case registerDeviceToken(token: String, environment: String?)
    case deleteDeviceToken(token: String)
    case digestDetail(date: String, type: String)

    // MARK: - Artist Role
    case artistSongs
    case addArtistSong(songTitle: String, artistName: String, isrc: String)
    case artistDashboard
    case artistWeeklyDigest
    case songAnalytics(songId: Int)
    case songStationBreakdown(songId: Int)
    case songHourlyHeatmap(songId: Int)
    case songPeakHours(songId: Int)
    case songTrend(songId: Int)

    // MARK: - Label Role
    case labelArtists
    case addLabelArtist(artistName: String)
    case removeLabelArtist(id: Int)
    case labelArtistSongs(artistId: Int)
    case toggleLabelSongMonitoring(artistId: Int, songTitle: String, artistName: String, isrc: String, enabled: Bool)
    case labelDashboard
    case labelComparison(artistIds: [Int])
    case labelStationAffinity
    case labelReleaseTracker(songId: Int)
    case browseArtists(query: String)
    case browseArtistTracks(deezerId: Int)

    // MARK: - Station Analytics
    case stationOverview(period: String)
    case stationTopSongs(period: String, limit: Int)
    case stationNewSongs(stationId: Int, period: String)
    case stationExclusiveSongs(stationId: Int, period: String)
    case stationPlaylistOverlap(competitorId: Int, period: String)
    case stationGenreDistribution(period: String)
    case stationRotation(period: String)
    case stationDiscoveryScore(period: String)

    var path: String {
        switch self {
        case .health:
            return "/health"
        case .register:
            return "/auth/register"
        case .login:
            return "/auth/login"
        case .refresh:
            return "/auth/refresh"
        case .logout:
            return "/auth/logout"
        case .dashboardSummary:
            return "/dashboard/summary"
        case .topStations:
            return "/dashboard/top-stations"
        case .airplayEvents:
            return "/airplay-events"
        case .snippetUrl(let eventId):
            return "/airplay-events/\(eventId)/snippet"
        case .stations:
            return "/stations"
        case .watchedStations, .addWatchedStation:
            return "/competitors/watched"
        case .removeWatchedStation(let stationId):
            return "/competitors/watched/\(stationId)"
        case .competitorSummary:
            return "/competitors/summary"
        case .competitorDetail(let stationId, _):
            return "/competitors/\(stationId)/detail"
        case .exportCSV:
            return "/exports/csv"
        case .exportPDF:
            return "/exports/pdf"
        case .notificationPreferences, .updateNotificationPreferences:
            return "/notifications/preferences"
        case .registerDeviceToken, .deleteDeviceToken:
            return "/notifications/device-token"
        case .digestDetail(let date, _):
            return "/notifications/digest/\(date)"

        // Artist Role
        case .artistSongs, .addArtistSong:
            return "/artist/songs"
        case .artistDashboard:
            return "/artist/dashboard"
        case .artistWeeklyDigest:
            return "/artist/weekly-digest"
        case .songAnalytics(let id):
            return "/artist/songs/\(id)/analytics"
        case .songStationBreakdown(let id):
            return "/artist/songs/\(id)/station-breakdown"
        case .songHourlyHeatmap(let id):
            return "/artist/songs/\(id)/hourly-heatmap"
        case .songPeakHours(let id):
            return "/artist/songs/\(id)/peak-hours"
        case .songTrend(let id):
            return "/artist/songs/\(id)/trend"

        // Label Role
        case .labelArtists, .addLabelArtist:
            return "/label/artists"
        case .removeLabelArtist(let id):
            return "/label/artists/\(id)"
        case .labelArtistSongs(let id):
            return "/label/artists/\(id)/songs"
        case .toggleLabelSongMonitoring(let id, _, _, _, _):
            return "/label/artists/\(id)/songs"
        case .labelDashboard:
            return "/label/dashboard"
        case .labelComparison:
            return "/label/comparison"
        case .labelStationAffinity:
            return "/label/station-affinity"
        case .labelReleaseTracker(let id):
            return "/label/releases/\(id)/tracker"
        case .browseArtists:
            return "/label/browse-artists"
        case .browseArtistTracks(let id):
            return "/label/browse-artists/\(id)/tracks"

        // Station Analytics
        case .stationOverview:
            return "/station/overview"
        case .stationTopSongs:
            return "/station/top-songs"
        case .stationNewSongs:
            return "/station/new-songs"
        case .stationExclusiveSongs:
            return "/station/exclusive-songs"
        case .stationPlaylistOverlap(let id, _):
            return "/station/overlap/\(id)"
        case .stationGenreDistribution:
            return "/station/genre-distribution"
        case .stationRotation:
            return "/station/rotation"
        case .stationDiscoveryScore:
            return "/station/discovery-score"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .register, .login, .refresh, .logout, .addWatchedStation, .registerDeviceToken,
             .addArtistSong, .addLabelArtist, .toggleLabelSongMonitoring:
            return .POST
        case .updateNotificationPreferences:
            return .PUT
        case .removeWatchedStation, .deleteDeviceToken, .removeLabelArtist:
            return .DELETE
        case .health, .dashboardSummary, .topStations, .airplayEvents, .snippetUrl, .stations,
             .watchedStations, .competitorSummary, .competitorDetail,
             .exportCSV, .exportPDF, .notificationPreferences, .digestDetail,
             .artistSongs, .artistDashboard, .artistWeeklyDigest,
             .songAnalytics, .songStationBreakdown, .songHourlyHeatmap, .songPeakHours, .songTrend,
             .labelArtists, .labelArtistSongs, .labelDashboard, .labelComparison,
             .labelStationAffinity, .labelReleaseTracker,
             .browseArtists, .browseArtistTracks,
             .stationOverview, .stationTopSongs, .stationNewSongs, .stationExclusiveSongs,
             .stationPlaylistOverlap, .stationGenreDistribution, .stationRotation, .stationDiscoveryScore:
            return .GET
        }
    }

    var body: Data? {
        let encoder = JSONEncoder()

        switch self {
        case .register(let code, let email, let password, let name):
            return try? encoder.encode(
                RegisterRequest(code: code, email: email, password: password, name: name)
            )
        case .login(let email, let password):
            return try? encoder.encode(
                LoginRequest(email: email, password: password)
            )
        case .refresh(let refreshToken):
            return try? encoder.encode(
                RefreshRequest(refreshToken: refreshToken)
            )
        case .logout(let refreshToken):
            return try? encoder.encode(
                LogoutRequest(refreshToken: refreshToken)
            )
        case .addWatchedStation(let stationId):
            return try? encoder.encode(
                AddWatchedStationRequest(stationId: stationId)
            )
        case .updateNotificationPreferences(let daily, let weekly):
            return try? encoder.encode(
                UpdatePreferencesRequest(dailyDigestEnabled: daily, weeklyDigestEnabled: weekly)
            )
        case .registerDeviceToken(let token, let environment):
            return try? encoder.encode(
                RegisterDeviceTokenRequest(token: token, environment: environment)
            )
        case .deleteDeviceToken(let token):
            return try? encoder.encode(
                DeleteDeviceTokenRequest(token: token)
            )
        case .addArtistSong(let title, let artist, let isrc):
            return try? encoder.encode(
                AddArtistSongRequest(songTitle: title, artistName: artist, isrc: isrc)
            )
        case .addLabelArtist(let name):
            return try? encoder.encode(
                AddLabelArtistRequest(artistName: name)
            )
        case .toggleLabelSongMonitoring(_, let title, let artist, let isrc, let enabled):
            return try? encoder.encode(
                ToggleLabelSongMonitoringRequest(songTitle: title, artistName: artist, isrc: isrc, enabled: enabled)
            )
        default:
            return nil
        }
    }

    var queryItems: [URLQueryItem]? {
        switch self {
        case .dashboardSummary(let period):
            return [URLQueryItem(name: "period", value: period)]

        case .topStations(let period, let limit):
            return [
                URLQueryItem(name: "period", value: period),
                URLQueryItem(name: "limit", value: String(limit)),
            ]

        case .airplayEvents(let cursor, let limit, let query, let startDate, let endDate, let stationId):
            var items: [URLQueryItem] = [
                URLQueryItem(name: "limit", value: String(limit)),
            ]
            if let cursor { items.append(URLQueryItem(name: "cursor", value: String(cursor))) }
            if let query, !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
            if let startDate { items.append(URLQueryItem(name: "startDate", value: startDate)) }
            if let endDate { items.append(URLQueryItem(name: "endDate", value: endDate)) }
            if let stationId { items.append(URLQueryItem(name: "stationId", value: String(stationId))) }
            return items

        case .exportCSV(let query, let startDate, let endDate, let stationId):
            var items: [URLQueryItem] = []
            if let query, !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
            if let startDate { items.append(URLQueryItem(name: "startDate", value: startDate)) }
            if let endDate { items.append(URLQueryItem(name: "endDate", value: endDate)) }
            if let stationId { items.append(URLQueryItem(name: "stationId", value: String(stationId))) }
            return items.isEmpty ? nil : items

        case .exportPDF(let startDate, let endDate, let query, let stationId):
            var items: [URLQueryItem] = [
                URLQueryItem(name: "startDate", value: startDate),
                URLQueryItem(name: "endDate", value: endDate),
            ]
            if let query, !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
            if let stationId { items.append(URLQueryItem(name: "stationId", value: String(stationId))) }
            return items

        case .competitorSummary(let period):
            return [URLQueryItem(name: "period", value: period)]

        case .competitorDetail(_, let period):
            return [URLQueryItem(name: "period", value: period)]

        case .digestDetail(_, let type):
            return [URLQueryItem(name: "type", value: type)]

        // Station Analytics
        case .stationOverview(let period):
            return [URLQueryItem(name: "period", value: period)]
        case .stationTopSongs(let period, let limit):
            return [
                URLQueryItem(name: "period", value: period),
                URLQueryItem(name: "limit", value: String(limit)),
            ]
        case .stationNewSongs(let stationId, let period):
            return [
                URLQueryItem(name: "stationId", value: String(stationId)),
                URLQueryItem(name: "period", value: period),
            ]
        case .stationExclusiveSongs(let stationId, let period):
            return [
                URLQueryItem(name: "stationId", value: String(stationId)),
                URLQueryItem(name: "period", value: period),
            ]
        case .stationPlaylistOverlap(_, let period):
            return [URLQueryItem(name: "period", value: period)]
        case .stationGenreDistribution(let period):
            return [URLQueryItem(name: "period", value: period)]
        case .stationRotation(let period):
            return [URLQueryItem(name: "period", value: period)]
        case .stationDiscoveryScore(let period):
            return [URLQueryItem(name: "period", value: period)]

        // Label Comparison
        case .labelComparison(let ids):
            return [URLQueryItem(name: "artistIds", value: ids.map(String.init).joined(separator: ","))]

        // Browse Artists
        case .browseArtists(let q):
            return [URLQueryItem(name: "q", value: q), URLQueryItem(name: "limit", value: "30")]

        default:
            return nil
        }
    }

    /// Whether this endpoint requires authentication (Bearer token).
    /// Auth endpoints (register, login, refresh) do not require a token.
    /// Logout requires a token (per backend: authenticate preHandler).
    var requiresAuth: Bool {
        switch self {
        case .health, .register, .login, .refresh:
            return false
        default:
            return true
        }
    }
}

// MARK: - Request Body Models

private struct RegisterRequest: Encodable {
    let code: String
    let email: String
    let password: String
    let name: String
}

private struct LoginRequest: Encodable {
    let email: String
    let password: String
}

private struct RefreshRequest: Encodable {
    let refreshToken: String
}

private struct LogoutRequest: Encodable {
    let refreshToken: String
}

private struct AddArtistSongRequest: Encodable {
    let songTitle: String
    let artistName: String
    let isrc: String
}

private struct AddLabelArtistRequest: Encodable {
    let artistName: String
}

private struct ToggleLabelSongMonitoringRequest: Encodable {
    let songTitle: String
    let artistName: String
    let isrc: String
    let enabled: Bool
}
