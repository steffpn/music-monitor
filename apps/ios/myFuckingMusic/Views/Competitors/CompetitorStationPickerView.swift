import SwiftUI

/// Station browser for adding competitor stations.
/// Shows all stations with search filtering.
/// Already-watched stations show a checkmark and are non-tappable.
struct CompetitorStationPickerView: View {
    let viewModel: CompetitorListViewModel

    @Environment(\.dismiss) private var dismiss

    @State private var stations: [Station] = []
    @State private var searchText = ""
    @State private var isLoadingStations = true
    @State private var addingStationId: Int?
    @State private var errorMessage: String?
    @State private var showErrorAlert = false

    /// Stations filtered by search text.
    private var filteredStations: [Station] {
        if searchText.isEmpty {
            return stations
        }
        return stations.filter {
            $0.name.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        Group {
            if isLoadingStations {
                LoadingView(message: "Loading stations...")
            } else {
                List(filteredStations) { station in
                    stationRow(station)
                }
                .searchable(text: $searchText, prompt: "Search stations")
            }
        }
        .navigationTitle("Add Competitor")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") {
                    dismiss()
                }
            }
        }
        .alert("Error", isPresented: $showErrorAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "An error occurred")
        }
        .task {
            await loadStations()
            await viewModel.loadWatchedStations()
            isLoadingStations = false
        }
    }

    // MARK: - Station Row

    @ViewBuilder
    private func stationRow(_ station: Station) -> some View {
        let isWatched = viewModel.watchedStations.contains { $0.stationId == station.id }
        let isAdding = addingStationId == station.id

        HStack {
            Text(station.name)
                .font(.body)

            Spacer()

            if isAdding {
                ProgressView()
            } else if isWatched {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            guard !isWatched && addingStationId == nil else { return }
            Task {
                await addCompetitor(stationId: station.id)
            }
        }
        .opacity(isWatched ? 0.6 : 1.0)
    }

    // MARK: - Actions

    private func loadStations() async {
        do {
            let stationList: [Station] = try await APIClient.shared.request(.stations)
            stations = stationList
        } catch {
            errorMessage = error.localizedDescription
            showErrorAlert = true
        }
    }

    private func addCompetitor(stationId: Int) async {
        addingStationId = stationId

        do {
            try await viewModel.addStation(stationId: stationId)
        } catch let error as APIError {
            switch error {
            case .httpError(let code, _):
                if code == 409 {
                    errorMessage = "This station is already in your competitor list."
                } else if code == 400 {
                    errorMessage = "Cannot add this station. You may have reached the maximum of 20 competitors, or this is your own station."
                } else {
                    errorMessage = error.localizedDescription
                }
            default:
                errorMessage = error.localizedDescription
            }
            showErrorAlert = true
        } catch {
            errorMessage = error.localizedDescription
            showErrorAlert = true
        }

        addingStationId = nil
    }
}

#Preview {
    NavigationStack {
        CompetitorStationPickerView(viewModel: CompetitorListViewModel())
    }
}
