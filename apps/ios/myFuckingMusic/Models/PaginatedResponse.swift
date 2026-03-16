import Foundation

/// Generic wrapper for cursor-paginated API responses.
/// Matches backend pattern: { data: [T], nextCursor: Int? }
struct PaginatedResponse<T: Codable & Sendable>: Codable, Sendable {
    let data: [T]
    let nextCursor: Int?
}
