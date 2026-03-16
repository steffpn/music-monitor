import SwiftUI

/// Competitor station list showing cards with station name, play count, and top song.
/// Station-role users access this from Settings > Competitor Stations.
struct CompetitorListView: View {
    @State private var viewModel = CompetitorListViewModel()
    @State private var showingStationPicker = false

    var body: some View {
        ZStack {
            if viewModel.isLoading && viewModel.cards.isEmpty {
                LoadingView()
            } else if let errorMessage = viewModel.error, viewModel.cards.isEmpty {
                ErrorView(message: errorMessage) {
                    Task { await viewModel.loadSummary() }
                }
            } else if viewModel.cards.isEmpty {
                // Empty state
                emptyStateView
            } else {
                // Content
                ScrollView {
                    VStack(spacing: 16) {
                        // Period picker
                        Picker("Period", selection: $viewModel.selectedPeriod) {
                            Text("Today").tag("day")
                            Text("This Week").tag("week")
                            Text("This Month").tag("month")
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal)

                        // Competitor cards
                        LazyVStack(spacing: 12) {
                            ForEach(viewModel.cards) { card in
                                NavigationLink {
                                    CompetitorDetailView(
                                        stationId: card.stationId,
                                        stationName: card.stationName
                                    )
                                } label: {
                                    CompetitorCardView(card: card)
                                }
                                .buttonStyle(.plain)
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        Task {
                                            await viewModel.removeStation(stationId: card.stationId)
                                        }
                                    } label: {
                                        Label("Remove", systemImage: "trash")
                                    }
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                    .padding(.vertical)
                }
                .refreshable {
                    await viewModel.loadSummary()
                }
            }
        }
        .navigationTitle("Competitors")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingStationPicker = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingStationPicker) {
            NavigationStack {
                CompetitorStationPickerView(viewModel: viewModel)
            }
        }
        .task(id: viewModel.selectedPeriod) {
            await viewModel.loadSummary()
        }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "binoculars")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)

            Text("No Competitor Stations")
                .font(.title3)
                .fontWeight(.semibold)

            Text("Tap + to start monitoring competitor stations")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Competitor Card

/// A card displaying a competitor station's summary data.
private struct CompetitorCardView: View {
    let card: CompetitorCard

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(card.stationName)
                    .font(.headline)

                Spacer()

                Text("\(card.playCount) plays")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let topSong = card.topSong {
                Text("'\(topSong.title)' by \(topSong.artist)")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            } else {
                Text("No plays")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    NavigationStack {
        CompetitorListView()
    }
}
