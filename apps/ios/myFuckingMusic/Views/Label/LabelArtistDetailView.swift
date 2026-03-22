import SwiftUI

/// Detail view for a single artist under the label.
/// Shows the artist's songs with monitoring toggles and play stats.
struct LabelArtistDetailView: View {
    let artistId: Int
    let artistName: String
    let pictureUrl: String?

    @State private var viewModel: LabelArtistDetailViewModel

    init(artistId: Int, artistName: String, pictureUrl: String? = nil) {
        self.artistId = artistId
        self.artistName = artistName
        self.pictureUrl = pictureUrl
        self._viewModel = State(initialValue: LabelArtistDetailViewModel(artistId: artistId))
    }

    var body: some View {
        ZStack {
            Color.rbBackground
                .ignoresSafeArea()

            if viewModel.isLoading && viewModel.songs.isEmpty {
                LoadingView()
            } else if let errorMessage = viewModel.error, viewModel.songs.isEmpty {
                ErrorView(message: errorMessage) {
                    Task { await viewModel.loadSongs() }
                }
            } else if viewModel.songs.isEmpty {
                emptyStateView
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        // Artist header
                        artistHeader

                        ForEach(viewModel.songs) { song in
                            if song.isMonitored {
                                NavigationLink {
                                    SongAnalyticsView(
                                        song: MonitoredSong(
                                            id: song.id,
                                            songTitle: song.songTitle,
                                            artistName: song.artistName,
                                            isrc: song.isrc,
                                            activatedAt: song.activatedAt ?? Date(),
                                            expiresAt: nil,
                                            status: "active",
                                            totalPlays: song.totalPlays,
                                            stationCount: song.stationCount,
                                            trend: nil
                                        )
                                    )
                                } label: {
                                    songRow(song)
                                }
                                .buttonStyle(.plain)
                            } else {
                                songRow(song)
                            }

                            Divider()
                                .overlay(Color.rbSurfaceLight.opacity(0.5))
                                .padding(.leading, 16)
                        }
                    }
                    .padding(.bottom, 40)
                }
                .refreshable {
                    await viewModel.loadSongs()
                }
            }
        }
        .navigationTitle(artistName)
        .navigationBarTitleDisplayMode(.large)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbarBackground(Color.rbBackground, for: .navigationBar)
        .preferredColorScheme(.dark)
        .task {
            await viewModel.loadSongs()
        }
    }

    // MARK: - Artist Header

    private var artistHeader: some View {
        HStack(spacing: 14) {
            if let urlString = pictureUrl, let url = URL(string: urlString) {
                AsyncImage(url: url) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [.rbAccent.opacity(0.3), .rbSurface],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                        Image(systemName: "person.fill")
                            .font(.system(size: 24))
                            .foregroundStyle(Color.rbAccent)
                    }
                }
                .frame(width: 56, height: 56)
                .clipShape(Circle())
            } else {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [.rbAccent.opacity(0.3), .rbSurface],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    Image(systemName: "person.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(Color.rbAccent)
                }
                .frame(width: 56, height: 56)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(artistName)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(Color.rbTextPrimary)

                let monitoredCount = viewModel.songs.filter(\.isMonitored).count
                Text("\(viewModel.songs.count) songs \u{2022} \(monitoredCount) monitored")
                    .font(.subheadline)
                    .foregroundStyle(Color.rbTextSecondary)
            }

            Spacer()
        }
        .padding(16)
    }

    // MARK: - Song Row

    @ViewBuilder
    private func songRow(_ song: LabelArtistSong) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                // Song icon
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(song.isMonitored ? Color.rbAccent.opacity(0.15) : Color.rbSurface)
                    .frame(width: 40, height: 40)
                    .overlay {
                        Image(systemName: song.isMonitored ? "waveform" : "music.note")
                            .font(.system(size: 16))
                            .foregroundStyle(song.isMonitored ? Color.rbAccent : Color.rbTextTertiary)
                    }

                VStack(alignment: .leading, spacing: 3) {
                    Text(song.songTitle)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.rbTextPrimary)
                        .lineLimit(1)

                    Text(song.isrc)
                        .font(.caption)
                        .foregroundStyle(Color.rbTextTertiary)
                        .lineLimit(1)
                }

                Spacer()

                // Toggle monitoring
                Toggle("", isOn: Binding(
                    get: { song.isMonitored },
                    set: { _ in
                        Task { await viewModel.toggleMonitoring(song: song) }
                    }
                ))
                .toggleStyle(SwitchToggleStyle(tint: Color.rbAccent))
                .labelsHidden()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            // Stats row for monitored songs
            if song.isMonitored {
                HStack(spacing: 16) {
                    Label("\(song.totalPlays) plays", systemImage: "play.fill")
                        .font(.caption)
                        .foregroundStyle(Color.rbAccent)

                    Label("\(song.stationCount) station\(song.stationCount == 1 ? "" : "s")", systemImage: "antenna.radiowaves.left.and.right")
                        .font(.caption)
                        .foregroundStyle(Color.rbTextSecondary)

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(Color.rbTextTertiary)
                }
                .padding(.horizontal, 16)
                .padding(.leading, 52)
                .padding(.bottom, 10)
            }
        }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "music.note.list")
                .font(.system(size: 48))
                .foregroundStyle(Color.rbTextTertiary)

            Text("No Songs Found")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.rbTextPrimary)

            Text("Songs for this artist will appear here once they are registered")
                .font(.subheadline)
                .foregroundStyle(Color.rbTextSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    NavigationStack {
        LabelArtistDetailView(artistId: 1, artistName: "Smiley")
    }
    .preferredColorScheme(.dark)
}
