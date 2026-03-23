import Foundation

/// Actor-based SSE client using URLSession.bytes for streaming.
/// Connects to the live-feed endpoint, parses SSE wire format, and yields AirplayEvent objects.
/// Tracks lastEventId for reconnection backfill via Last-Event-ID header.
actor SSEClient {
    private var task: Task<Void, Never>?
    private(set) var lastEventId: String?

    // MARK: - SSE Payload Decoding

    /// Matches the SSE data payload from the backend LiveDetectionEvent format.
    /// Differs from AirplayEvent (no endedAt, playCount, createdAt, station struct).
    private struct LiveDetectionEvent: Codable, Sendable {
        let id: Int
        let stationId: Int
        let songTitle: String
        let artistName: String
        let isrc: String?
        let snippetUrl: String?
        let stationName: String
        let startedAt: String   // ISO 8601
        let publishedAt: String // ISO 8601
    }

    // MARK: - Date Parsing

    /// ISO 8601 formatter with fractional seconds (primary).
    private static let iso8601WithFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    /// ISO 8601 formatter without fractional seconds (fallback).
    private static let iso8601WithoutFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// Parse ISO 8601 date string with fractional seconds fallback.
    private static func parseDate(_ string: String) -> Date {
        if let date = iso8601WithFractional.date(from: string) {
            return date
        }
        if let date = iso8601WithoutFractional.date(from: string) {
            return date
        }
        return Date()
    }

    // MARK: - Connect

    /// Connect to the SSE live-feed endpoint.
    /// Returns an AsyncStream of AirplayEvent objects decoded from SSE frames.
    /// If lastEventId is set (from a previous connection), sends Last-Event-ID header for backfill.
    func connect(baseURL: URL, token: String) -> AsyncStream<AirplayEvent> {
        AsyncStream { continuation in
            let streamTask = Task { [weak self] in
                guard let self else {
                    continuation.finish()
                    return
                }

                // Build URL: baseURL/v1/live-feed?token=xxx
                var components = URLComponents(url: baseURL.appendingPathComponent("v1/live-feed"), resolvingAgainstBaseURL: false)!
                components.queryItems = [URLQueryItem(name: "token", value: token)]

                guard let url = components.url else {
                    continuation.finish()
                    return
                }

                var request = URLRequest(url: url)
                request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                request.timeoutInterval = 0 // No timeout for SSE streaming

                // Send Last-Event-ID for backfill on reconnection
                let lastId = await self.lastEventId
                if let lastId {
                    request.setValue(lastId, forHTTPHeaderField: "Last-Event-ID")
                }

                do {
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)

                    guard let httpResponse = response as? HTTPURLResponse,
                          httpResponse.statusCode == 200 else {
                        continuation.finish()
                        return
                    }

                    // JSON decoder for SSE data payloads
                    let decoder = JSONDecoder()
                    decoder.keyDecodingStrategy = .convertFromSnakeCase

                    // SSE frame parsing state
                    var currentId: String?
                    var currentEvent: String?
                    var currentData: String?

                    for try await line in bytes.lines {
                        // Check cancellation
                        if Task.isCancelled { break }

                        if line.hasPrefix("id:") {
                            // id: 42
                            currentId = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                        } else if line.hasPrefix("event:") {
                            // event: detection
                            currentEvent = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                        } else if line.hasPrefix("data:") {
                            // data: {"id":42,...}
                            currentData = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                        } else if line.hasPrefix(":") {
                            // Comment / keepalive -- ignore
                        } else if line.isEmpty {
                            // Empty line = end of SSE event frame
                            if currentEvent == "detection",
                               let dataString = currentData,
                               let data = dataString.data(using: .utf8) {
                                do {
                                    let liveEvent = try decoder.decode(LiveDetectionEvent.self, from: data)

                                    // Convert LiveDetectionEvent to AirplayEvent
                                    let startedAt = Self.parseDate(liveEvent.startedAt)
                                    let publishedAt = Self.parseDate(liveEvent.publishedAt)

                                    let airplayEvent = AirplayEvent(
                                        id: liveEvent.id,
                                        stationId: liveEvent.stationId,
                                        startedAt: startedAt,
                                        endedAt: startedAt,
                                        songTitle: liveEvent.songTitle,
                                        artistName: liveEvent.artistName,
                                        isrc: liveEvent.isrc,
                                        confidence: nil,
                                        playCount: 1,
                                        snippetUrl: liveEvent.snippetUrl,
                                        createdAt: publishedAt,
                                        station: AirplayEvent.StationInfo(name: liveEvent.stationName)
                                    )

                                    continuation.yield(airplayEvent)

                                    // Update lastEventId for reconnection backfill
                                    if let id = currentId {
                                        await self.setLastEventId(id)
                                    }
                                } catch {
                                    // Decoding error -- skip this event, continue stream
                                }
                            }

                            // Reset frame state
                            currentId = nil
                            currentEvent = nil
                            currentData = nil
                        }
                    }
                } catch {
                    // Stream error or network failure -- finish the continuation
                }

                continuation.finish()
            }

            self.task = streamTask

            continuation.onTermination = { _ in
                streamTask.cancel()
            }
        }
    }

    // MARK: - Disconnect

    /// Cancel the streaming task and clean up.
    func disconnect() {
        task?.cancel()
        task = nil
    }

    // MARK: - Private Helpers

    private func setLastEventId(_ id: String) {
        lastEventId = id
    }
}
