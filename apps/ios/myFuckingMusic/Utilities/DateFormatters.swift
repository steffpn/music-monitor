import Foundation

/// Shared date formatting utilities for consistent display across the app.
enum DateFormatters {

    // MARK: - Parsing

    /// ISO 8601 formatter for parsing API date strings.
    /// Backup for cases where JSONDecoder .iso8601 strategy doesn't cover all formats.
    static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    // MARK: - Display

    /// Relative time display: "2h ago", "Yesterday", "Mar 15" style.
    /// Uses RelativeDateTimeFormatter for recent dates, DateFormatter for older ones.
    static func relativeTime(_ date: Date) -> String {
        let now = Date()
        let interval = now.timeIntervalSince(date)

        // Within the last 7 days: use relative formatter
        if interval < 7 * 24 * 3600 && interval >= 0 {
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .abbreviated
            return formatter.localizedString(for: date, relativeTo: now)
        }

        // Older: show "Mar 15" style
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }

    /// Short date-time format: "Mar 15, 2:30 PM" for detection row timestamps.
    static func shortDateTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d, h:mm a"
        return formatter.string(from: date)
    }

    /// Date-only format: "Mar 15, 2026" for filter display.
    static func dateOnly(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    /// ISO date string: "2026-03-15" format for API query parameters.
    static func isoDateString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }
}
