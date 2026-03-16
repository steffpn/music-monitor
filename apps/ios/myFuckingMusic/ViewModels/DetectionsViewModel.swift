import Foundation
import Observation

/// ViewModel managing detections list state: search, filters, cursor-based pagination.
/// Uses @Observable macro (iOS 17+) per project convention.
@Observable
@MainActor
final class DetectionsViewModel {

    // MARK: - Data

    var detections: [AirplayEvent] = []
    var stations: [Station] = []

    // MARK: - Loading State

    var isLoading = false
    var isLoadingMore = false
    var error: String?

    // MARK: - Pagination

    private(set) var nextCursor: Int?

    var hasMore: Bool {
        nextCursor != nil
    }

    // MARK: - Search & Filters

    var searchQuery = ""
    var startDate: Date?
    var endDate: Date?
    var selectedStationId: Int?

    // MARK: - Page Size

    private let pageSize = 20

    // MARK: - Public Methods

    /// Load the first page of detections. Resets cursor and replaces current data.
    /// Called on initial load, search change, and filter change.
    func loadInitial() async {
        isLoading = true
        error = nil
        nextCursor = nil
        detections = []

        do {
            let response = try await fetchPage(cursor: nil)
            detections = response.data
            nextCursor = response.nextCursor
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    /// Load the next page of detections. Appends to existing data.
    /// Guards against concurrent loads and end-of-list.
    func loadMore() async {
        guard !isLoadingMore, hasMore else { return }

        isLoadingMore = true

        do {
            let response = try await fetchPage(cursor: nextCursor)
            detections.append(contentsOf: response.data)
            nextCursor = response.nextCursor
        } catch {
            self.error = error.localizedDescription
        }

        isLoadingMore = false
    }

    /// Pull-to-refresh handler. Same as loadInitial.
    func refresh() async {
        await loadInitial()
    }

    /// Fetch station list for filter picker. Called once on view appear.
    func loadStations() async {
        guard stations.isEmpty else { return }

        do {
            let result: [Station] = try await APIClient.shared.request(.stations)
            stations = result
        } catch {
            // Stations are optional for filtering -- log but don't block UI
            print("Failed to load stations: \(error.localizedDescription)")
        }
    }

    // MARK: - Private

    /// Fetch a single page of airplay events from the API.
    private func fetchPage(cursor: Int?) async throws -> PaginatedResponse<AirplayEvent> {
        let query = searchQuery.isEmpty ? nil : searchQuery
        let start = startDate.map { DateFormatters.isoDateString($0) }
        let end = endDate.map { DateFormatters.isoDateString($0) }

        let response: PaginatedResponse<AirplayEvent> = try await APIClient.shared.request(
            .airplayEvents(
                cursor: cursor,
                limit: pageSize,
                query: query,
                startDate: start,
                endDate: end,
                stationId: selectedStationId
            )
        )

        return response
    }
}
