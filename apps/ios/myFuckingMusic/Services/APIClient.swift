import Foundation

/// URLSession-based API client with async/await.
/// No third-party dependencies (no Alamofire) per locked decisions.
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var baseURL: URL

    /// Reference to AuthManager for token refresh on 401.
    /// Set via configure() to avoid circular init.
    private var authManager: AuthManager?

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        self.encoder = encoder

        // Production API on Railway
        self.baseURL = URL(string: "https://api-production-94f67.up.railway.app/api/v1")!
    }

    func configure(authManager: AuthManager) {
        self.authManager = authManager
    }

    func setBaseURL(_ url: URL) {
        self.baseURL = url
    }

    /// Expose the base URL for services that need direct access (e.g., SSEClient).
    func getBaseURL() -> URL {
        return baseURL
    }

    /// Make an authenticated request. Injects Bearer token and retries once on 401.
    func request<T: Decodable & Sendable>(_ endpoint: APIEndpoint) async throws -> T {
        let urlRequest = try buildRequest(for: endpoint, includeAuth: endpoint.requiresAuth)

        print("[API] \(endpoint.method.rawValue) \(urlRequest.url?.absoluteString ?? "?")")

        let (data, response) = try await session.data(for: urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode >= 400 {
            print("[API] \(httpResponse.statusCode) \(String(data: data, encoding: .utf8) ?? "")")
        }

        // On 401: attempt token refresh and retry once
        if httpResponse.statusCode == 401, endpoint.requiresAuth {
            if let authManager {
                do {
                    _ = try await authManager.refreshAccessToken()

                    // Retry with new token
                    let retryRequest = try buildRequest(for: endpoint, includeAuth: true)
                    let (retryData, retryResponse) = try await session.data(for: retryRequest)

                    guard let retryHttp = retryResponse as? HTTPURLResponse else {
                        throw APIError.invalidResponse
                    }

                    guard (200...299).contains(retryHttp.statusCode) else {
                        throw APIError.httpError(statusCode: retryHttp.statusCode, data: retryData)
                    }

                    return try decoder.decode(T.self, from: retryData)
                } catch {
                    // Refresh failed -- throw the original 401
                    throw APIError.httpError(statusCode: 401, data: data)
                }
            }
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(statusCode: httpResponse.statusCode, data: data)
        }

        return try decoder.decode(T.self, from: data)
    }

    /// Make a request without auth header injection or 401 retry.
    /// Used for token refresh endpoint to avoid circular refresh loops.
    func requestWithoutAuth<T: Decodable & Sendable>(_ endpoint: APIEndpoint) async throws -> T {
        let urlRequest = try buildRequest(for: endpoint, includeAuth: false)

        let (data, response) = try await session.data(for: urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(statusCode: httpResponse.statusCode, data: data)
        }

        return try decoder.decode(T.self, from: data)
    }

    /// Build a URLRequest for the given endpoint.
    private func buildRequest(for endpoint: APIEndpoint, includeAuth: Bool) throws -> URLRequest {
        var components = URLComponents(
            url: baseURL.appendingPathComponent(endpoint.path),
            resolvingAgainstBaseURL: false
        )!

        if let queryItems = endpoint.queryItems {
            components.queryItems = queryItems
        }

        guard let url = components.url else {
            throw APIError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue

        if let body = endpoint.body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        // Inject auth token if required
        if includeAuth, let token = KeychainHelper.read(key: "accessToken") {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        return request
    }

    /// Raw request returning Data and HTTPURLResponse for callers needing custom handling.
    func requestRaw(_ endpoint: APIEndpoint) async throws -> (Data, HTTPURLResponse) {
        let urlRequest = try buildRequest(for: endpoint, includeAuth: endpoint.requiresAuth)

        let (data, response) = try await session.data(for: urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        return (data, httpResponse)
    }
}

enum HTTPMethod: String, Sendable {
    case GET, POST, PUT, PATCH, DELETE
}

enum APIError: Error, LocalizedError, Sendable {
    case invalidResponse
    case httpError(statusCode: Int, data: Data)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid server response"
        case .httpError(let code, let data):
            // Try to extract error message from response body
            if let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                return errorResponse.error
            }
            return "HTTP error: \(code)"
        case .decodingError(let error):
            return "Decoding error: \(error.localizedDescription)"
        }
    }
}
