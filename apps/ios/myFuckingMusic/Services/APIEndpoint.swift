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

    // Exports
    case exportCSV(query: String?, startDate: String?, endDate: String?, stationId: Int?)
    case exportPDF(startDate: String, endDate: String, query: String?, stationId: Int?)

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
        case .exportCSV:
            return "/exports/csv"
        case .exportPDF:
            return "/exports/pdf"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .register, .login, .refresh, .logout:
            return .POST
        case .health, .dashboardSummary, .topStations, .airplayEvents, .snippetUrl, .stations,
             .exportCSV, .exportPDF:
            return .GET
        }
    }

    var body: Data? {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase

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
