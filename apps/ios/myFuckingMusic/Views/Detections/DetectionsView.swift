import SwiftUI

/// Main detections tab.
/// Shows paginated airplay events with search bar, filter chips, infinite scroll,
/// and SSE connection status indicator.
struct DetectionsView: View {
    @State private var viewModel = DetectionsViewModel()
    @State private var exportViewModel = ExportViewModel()
    @State private var liveFeedViewModel = LiveFeedViewModel()
    @Environment(AudioPlayerManager.self) private var audioPlayer
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Filter chips below search bar
                FilterChipsView(
                    startDate: $viewModel.startDate,
                    endDate: $viewModel.endDate,
                    selectedStationId: $viewModel.selectedStationId,
                    stations: viewModel.stations,
                    onFilterChange: {
                        await viewModel.loadInitial()
                    }
                )

                // Main content
                Group {
                    if viewModel.isLoading && viewModel.detections.isEmpty {
                        LoadingView(message: "Loading detections...")
                    } else if let error = viewModel.error, viewModel.detections.isEmpty {
                        ErrorView(message: error) {
                            Task {
                                await viewModel.loadInitial()
                            }
                        }
                    } else if viewModel.detections.isEmpty && !viewModel.isLoading {
                        emptyState
                    } else {
                        detectionsList
                    }
                }
            }
            .background(Color.rbBackground)
            .navigationTitle("Detections")
            .navigationBarTitleDisplayMode(.large)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbarBackground(Color.rbBackground, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 12) {
                        connectionIndicator

                        Menu {
                            Button {
                                Task {
                                    await exportViewModel.exportCSV(
                                        query: viewModel.searchQuery.isEmpty ? nil : viewModel.searchQuery,
                                        startDate: viewModel.startDate,
                                        endDate: viewModel.endDate,
                                        stationId: viewModel.selectedStationId
                                    )
                                }
                            } label: {
                                Label("Export CSV", systemImage: "tablecells")
                            }

                            Button {
                                Task {
                                    await exportViewModel.exportPDF(
                                        query: viewModel.searchQuery.isEmpty ? nil : viewModel.searchQuery,
                                        startDate: viewModel.startDate,
                                        endDate: viewModel.endDate,
                                        stationId: viewModel.selectedStationId
                                    )
                                }
                            } label: {
                                Label("Export PDF", systemImage: "doc.richtext")
                            }
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                                .foregroundStyle(Color.rbAccent)
                        }
                        .disabled(exportViewModel.isExporting)
                    }
                }
            }
            .overlay {
                if exportViewModel.isExporting {
                    ZStack {
                        Color.black.opacity(0.5)
                            .ignoresSafeArea()

                        VStack(spacing: 12) {
                            ProgressView()
                                .controlSize(.large)
                                .tint(Color.rbAccent)
                            Text("Exporting...")
                                .font(.subheadline)
                                .foregroundStyle(Color.rbTextSecondary)
                        }
                        .padding(24)
                        .background(Color.rbSurface, in: RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
            .alert(
                "Export Error",
                isPresented: Binding(
                    get: { exportViewModel.error != nil },
                    set: { if !$0 { exportViewModel.error = nil } }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                if let error = exportViewModel.error {
                    Text(error)
                }
            }
            .sheet(isPresented: $exportViewModel.showShareSheet) {
                if let url = exportViewModel.exportedFileURL {
                    ShareSheet(url: url)
                }
            }
            .searchable(
                text: $viewModel.searchQuery,
                prompt: "Search songs, artists, ISRC..."
            )
            .refreshable {
                await viewModel.refresh()
            }
            .task {
                await viewModel.loadStations()
                await viewModel.loadInitial()
            }
            .task(id: viewModel.searchQuery) {
                // Debounce search: wait 300ms, then reload.
                // SwiftUI .task(id:) auto-cancels previous tasks when searchQuery changes.
                do {
                    try await Task.sleep(for: .milliseconds(300))
                    await viewModel.loadInitial()
                } catch {
                    // Task cancelled -- a new search query was typed
                }
            }
            .task {
                await connectToSSE()
            }
            .onChange(of: scenePhase) { _, newPhase in
                handleScenePhaseChange(newPhase)
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - SSE Connection Indicator

    /// Colored pill in the toolbar indicating SSE connection state.
    private var connectionIndicator: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(connectionColor)
                .frame(width: 6, height: 6)
            Text(connectionLabel)
                .font(.caption2)
                .foregroundStyle(Color.rbTextSecondary)
        }
    }

    private var connectionColor: Color {
        switch liveFeedViewModel.connectionState {
        case .connected:
            return .rbLive
        case .disconnected:
            return .rbTextTertiary
        case .connecting, .reconnecting:
            return .rbWarning
        }
    }

    private var connectionLabel: String {
        switch liveFeedViewModel.connectionState {
        case .connected:
            return "Live"
        case .disconnected:
            return "Offline"
        case .connecting:
            return "Connecting..."
        case .reconnecting:
            return "Reconnecting..."
        }
    }

    // MARK: - SSE Lifecycle

    private func connectToSSE() async {
        guard let token = KeychainHelper.read(key: "accessToken") else { return }
        await liveFeedViewModel.connect(token: token)
    }

    private func handleScenePhaseChange(_ phase: ScenePhase) {
        switch phase {
        case .background:
            liveFeedViewModel.scheduleDisconnect(after: 30)
        case .active:
            liveFeedViewModel.cancelScheduledDisconnect()
            if liveFeedViewModel.connectionState == .disconnected {
                guard let token = KeychainHelper.read(key: "accessToken") else { return }
                Task { await liveFeedViewModel.reconnect(token: token) }
            }
        default:
            break
        }
    }

    // MARK: - Detections List

    private var detectionsList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(Array(viewModel.detections.enumerated()), id: \.element.id) { index, event in
                    DetectionRowView(event: event)

                    Divider()
                        .overlay(Color.rbSurfaceLight)
                        .padding(.leading)

                    // Trigger load more when approaching the last 5 items
                    if index >= viewModel.detections.count - 5 {
                        Color.clear
                            .frame(height: 0)
                            .onAppear {
                                Task {
                                    await viewModel.loadMore()
                                }
                            }
                    }
                }

                // Loading more indicator
                if viewModel.isLoadingMore {
                    ProgressView()
                        .tint(Color.rbAccent)
                        .padding()
                }
            }
            .animation(.easeInOut, value: audioPlayer.currentlyPlayingId)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "music.note.list")
                .font(.system(size: 40))
                .foregroundStyle(Color.rbTextTertiary)

            Text("No detections found")
                .font(.headline)
                .foregroundStyle(Color.rbTextSecondary)

            if !viewModel.searchQuery.isEmpty {
                Text("Try a different search term")
                    .font(.subheadline)
                    .foregroundStyle(Color.rbTextTertiary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.rbBackground)
    }
}

// MARK: - Share Sheet

/// UIActivityViewController wrapper for presenting downloaded export files.
/// ShareLink requires compile-time item; since we download async, UIActivityViewController is needed.
private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

#Preview {
    DetectionsView()
        .environment(AudioPlayerManager())
}
