import Foundation
import Observation

/// Manages export state: loading, error, and the exported file URL for share sheet presentation.
/// Uses @Observable macro (iOS 17+) per project convention.
@Observable
@MainActor
final class ExportViewModel {

    // MARK: - State

    var isExporting = false
    var error: String?
    var exportedFileURL: URL?
    var showShareSheet = false

    // MARK: - Export Actions

    /// Export detections as CSV using the current filter state.
    /// All parameters are optional -- the API returns all data when no filters are set.
    func exportCSV(query: String?, startDate: Date?, endDate: Date?, stationId: Int?) async {
        isExporting = true
        error = nil

        let start = startDate.map { DateFormatters.isoDateString($0) }
        let end = endDate.map { DateFormatters.isoDateString($0) }

        do {
            let url = try await ExportService.shared.downloadExport(
                endpoint: .exportCSV(query: query, startDate: start, endDate: end, stationId: stationId)
            )
            exportedFileURL = url
            showShareSheet = true
        } catch {
            self.error = error.localizedDescription
        }

        isExporting = false
    }

    /// Export detections as a branded PDF report.
    /// Requires startDate and endDate -- shows an error if either is missing.
    func exportPDF(query: String?, startDate: Date?, endDate: Date?, stationId: Int?) async {
        guard let startDate, let endDate else {
            error = "PDF reports require a date range. Please set start and end dates in filters."
            return
        }

        isExporting = true
        error = nil

        let start = DateFormatters.isoDateString(startDate)
        let end = DateFormatters.isoDateString(endDate)

        do {
            let url = try await ExportService.shared.downloadExport(
                endpoint: .exportPDF(startDate: start, endDate: end, query: query, stationId: stationId)
            )
            exportedFileURL = url
            showShareSheet = true
        } catch {
            self.error = error.localizedDescription
        }

        isExporting = false
    }
}
