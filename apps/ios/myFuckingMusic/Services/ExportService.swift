import Foundation

/// Downloads export files (CSV, PDF) from the API and writes them to a temporary directory.
/// Returns a file URL suitable for presentation in a share sheet.
final class ExportService: @unchecked Sendable {
    static let shared = ExportService()

    private init() {}

    /// Download an export file from the given endpoint.
    /// - Parameter endpoint: An `.exportCSV` or `.exportPDF` API endpoint.
    /// - Returns: A file URL pointing to the downloaded file in the temporary directory.
    func downloadExport(endpoint: APIEndpoint) async throws -> URL {
        let (data, response) = try await APIClient.shared.requestRaw(endpoint)

        guard (200...299).contains(response.statusCode) else {
            throw APIError.httpError(statusCode: response.statusCode, data: data)
        }

        // Extract filename from Content-Disposition header, fallback based on Content-Type
        let filename = extractFilename(from: response)

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(filename)

        // Remove any existing file at the path to avoid write errors
        try? FileManager.default.removeItem(at: tempURL)
        try data.write(to: tempURL)

        return tempURL
    }

    // MARK: - Private

    /// Parse the filename from Content-Disposition header.
    /// Falls back to a default name based on Content-Type.
    private func extractFilename(from response: HTTPURLResponse) -> String {
        if let disposition = response.value(forHTTPHeaderField: "Content-Disposition"),
           let match = disposition.range(of: #"filename="?([^";\s]+)"?"#, options: .regularExpression) {
            let captured = disposition[match]
            // Strip filename= prefix and any quotes
            let name = captured
                .replacingOccurrences(of: "filename=", with: "")
                .replacingOccurrences(of: "\"", with: "")
            if !name.isEmpty {
                return name
            }
        }

        // Fallback based on Content-Type
        let contentType = response.value(forHTTPHeaderField: "Content-Type") ?? ""
        if contentType.contains("pdf") {
            return "report.pdf"
        }
        return "export.csv"
    }
}
