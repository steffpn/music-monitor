import SwiftUI

/// Detail view for a single competitor station.
/// Shows top songs, recent detections, and play count comparison.
/// Day/Week/Month segmented control switches the data period.
struct CompetitorDetailView: View {
    let stationId: Int
    let stationName: String

    @State private var viewModel: CompetitorDetailViewModel

    init(stationId: Int, stationName: String) {
        self.stationId = stationId
        self.stationName = stationName
        self._viewModel = State(initialValue: CompetitorDetailViewModel(
            stationId: stationId,
            stationName: stationName
        ))
    }

    var body: some View {
        ZStack {
            if viewModel.isLoading && viewModel.detail == nil {
                LoadingView()
            } else if let errorMessage = viewModel.error, viewModel.detail == nil {
                ErrorView(message: errorMessage) {
                    Task { await viewModel.loadDetail() }
                }
            } else {
                ScrollView {
                    VStack(spacing: 20) {
                        // Period picker
                        Picker("Period", selection: $viewModel.selectedPeriod) {
                            Text("Today").tag("day")
                            Text("This Week").tag("week")
                            Text("This Month").tag("month")
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal)

                        if let detail = viewModel.detail {
                            // Top Songs section
                            topSongsSection(detail.topSongs)

                            // Recent Detections section
                            recentDetectionsSection(detail.recentDetections)

                            // Play Count Comparison section
                            comparisonSection(detail.comparison)
                        }
                    }
                    .padding(.vertical)
                }
                .refreshable {
                    await viewModel.loadDetail()
                }
            }
        }
        .navigationTitle(stationName)
        .task(id: viewModel.selectedPeriod) {
            await viewModel.loadDetail()
        }
    }

    // MARK: - Top Songs Section

    @ViewBuilder
    private func topSongsSection(_ songs: [CompetitorSong]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Top Songs")
                .font(.title3)
                .fontWeight(.semibold)
                .padding(.horizontal)

            if songs.isEmpty {
                Text("No songs detected")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding()
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(Array(songs.enumerated()), id: \.element.id) { index, song in
                        HStack(spacing: 12) {
                            Text("\(index + 1).")
                                .font(.headline)
                                .foregroundStyle(.secondary)
                                .frame(width: 30, alignment: .trailing)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(song.title)
                                    .font(.body)
                                    .lineLimit(1)
                                Text(song.artist)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }

                            Spacer()

                            Text("\(song.playCount)")
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color(.tertiarySystemBackground))
                                .clipShape(Capsule())
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 8)

                        if index < songs.count - 1 {
                            Divider()
                                .padding(.leading, 54)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Recent Detections Section

    @ViewBuilder
    private func recentDetectionsSection(_ detections: [CompetitorDetection]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent Detections")
                .font(.title3)
                .fontWeight(.semibold)
                .padding(.horizontal)

            if detections.isEmpty {
                Text("No recent detections")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding()
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(detections.prefix(20)) { detection in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(detection.songTitle)
                                    .font(.body)
                                    .lineLimit(1)
                                Text(detection.artistName)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }

                            Spacer()

                            Text(formatDetectionTime(detection.startedAt))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 8)

                        Divider()
                            .padding(.leading)
                    }
                }
            }
        }
    }

    // MARK: - Play Count Comparison Section

    @ViewBuilder
    private func comparisonSection(_ comparisons: [CompetitorComparison]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Play Count Comparison")
                .font(.title3)
                .fontWeight(.semibold)
                .padding(.horizontal)

            if comparisons.isEmpty {
                Text("No overlapping songs")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding()
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(comparisons) { comparison in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(comparison.songTitle)
                                    .font(.body)
                                    .lineLimit(1)
                                Text(comparison.artistName)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }

                            Spacer()

                            VStack(alignment: .trailing, spacing: 2) {
                                Text("Theirs: \(comparison.theirPlays)")
                                    .font(.caption)
                                    .foregroundStyle(comparison.theirPlays > comparison.yourPlays ? .red : .secondary)

                                Text("Yours: \(comparison.yourPlays)")
                                    .font(.caption)
                                    .foregroundStyle(comparison.yourPlays > comparison.theirPlays ? .green : .secondary)
                            }
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 8)

                        Divider()
                            .padding(.leading)
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    /// Format an ISO date string to a short time display.
    private func formatDetectionTime(_ isoString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: isoString) {
            return DateFormatters.shortDateTime(date)
        }
        // Try without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: isoString) {
            return DateFormatters.shortDateTime(date)
        }
        return isoString
    }
}

#Preview {
    NavigationStack {
        CompetitorDetailView(stationId: 1, stationName: "Radio ZU")
    }
}
