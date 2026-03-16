import Foundation

/// Manages state for a single competitor station's detail view.
/// Loads top songs, recent detections, and play count comparison.
@MainActor
@Observable
final class CompetitorDetailViewModel {
    // MARK: - Configuration

    /// The competitor station ID to fetch detail for.
    let stationId: Int

    /// The competitor station name (for display).
    let stationName: String

    // MARK: - Published State

    /// Selected time period for detail data.
    var selectedPeriod: String = "day"

    /// Detail data including top songs, recent detections, and comparison.
    var detail: CompetitorDetail?

    /// Whether a data fetch is in progress.
    var isLoading = false

    /// Error message to display. Nil when no error.
    var error: String?

    // MARK: - Init

    init(stationId: Int, stationName: String) {
        self.stationId = stationId
        self.stationName = stationName
    }

    // MARK: - Data Loading

    /// Fetch competitor detail for the selected period.
    /// Called via .task(id: selectedPeriod) in the view.
    func loadDetail() async {
        isLoading = true
        error = nil

        do {
            let result: CompetitorDetail = try await APIClient.shared.request(
                .competitorDetail(stationId: stationId, period: selectedPeriod)
            )
            detail = result
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }
}
