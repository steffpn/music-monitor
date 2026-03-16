import Foundation

/// Manages competitor station list state: cards, watched stations, add/remove operations.
/// Uses @Observable for modern SwiftUI data flow (iOS 17+).
@MainActor
@Observable
final class CompetitorListViewModel {
    // MARK: - Published State

    /// Competitor cards with summary data for the selected period.
    var cards: [CompetitorCard] = []

    /// Currently watched stations (used by picker to show already-watched).
    var watchedStations: [WatchedStation] = []

    /// Selected time period for competitor summary data.
    var selectedPeriod: String = "day"

    /// Whether a data fetch is in progress.
    var isLoading = false

    /// Error message to display. Nil when no error.
    var error: String?

    // MARK: - Data Loading

    /// Fetch competitor summary cards for the selected period.
    func loadSummary() async {
        isLoading = true
        error = nil

        do {
            let summaryCards: [CompetitorCard] = try await APIClient.shared.request(
                .competitorSummary(period: selectedPeriod)
            )
            cards = summaryCards
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    /// Fetch the list of watched stations (for picker display).
    func loadWatchedStations() async {
        do {
            let watched: [WatchedStation] = try await APIClient.shared.request(
                .watchedStations
            )
            watchedStations = watched
        } catch {
            // Non-critical -- picker can still function
            self.error = error.localizedDescription
        }
    }

    // MARK: - Mutations

    /// Add a station to the watched competitors list.
    /// Handles 409 (already watched) and 400 (max reached or own station).
    func addStation(stationId: Int) async throws {
        let _: WatchedStation = try await APIClient.shared.request(
            .addWatchedStation(stationId: stationId)
        )

        // Reload both watched list and summary after adding
        await loadWatchedStations()
        await loadSummary()
    }

    /// Remove a station from the watched competitors list.
    func removeStation(stationId: Int) async {
        do {
            let (_, response) = try await APIClient.shared.requestRaw(
                .removeWatchedStation(stationId: stationId)
            )

            if (200...299).contains(response.statusCode) {
                // Remove from local arrays immediately
                cards.removeAll { $0.stationId == stationId }
                watchedStations.removeAll { $0.stationId == stationId }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
