import SwiftUI

/// Main dashboard for label role users.
/// Shows total plays across all artists, artist summary cards, and catalog songs list.
struct LabelDashboardView: View {
    @State private var viewModel = LabelDashboardViewModel()

    var body: some View {
        ZStack {
            Color.rbBackground
                .ignoresSafeArea()

            if viewModel.isLoading && viewModel.dashboard == nil {
                LoadingView()
            } else if let errorMessage = viewModel.error, viewModel.dashboard == nil {
                ErrorView(message: errorMessage) {
                    Task { await viewModel.loadDashboard() }
                }
            } else {
                ScrollView {
                    VStack(spacing: 24) {
                        // Big number: total plays
                        if let dash = viewModel.dashboard {
                            totalPlaysCard(dash.totalPlays)
                        }

                        // Artist summary cards (horizontal scroll)
                        if let artists = viewModel.dashboard?.artistSummaries, !artists.isEmpty {
                            artistSummarySection(artists)
                        }

                        // Catalog songs list
                        if let songs = viewModel.dashboard?.catalogSongs, !songs.isEmpty {
                            catalogSongsSection(songs)
                        }
                    }
                    .padding(.top, 12)
                    .padding(.bottom, 40)
                }
                .refreshable {
                    await viewModel.loadDashboard()
                }
            }
        }
        .navigationTitle("Label Dashboard")
        .navigationBarTitleDisplayMode(.large)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbarBackground(Color.rbBackground, for: .navigationBar)
        .preferredColorScheme(.dark)
        .task {
            await viewModel.loadDashboard()
        }
    }

    // MARK: - Total Plays Card

    @ViewBuilder
    private func totalPlaysCard(_ totalPlays: Int) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "waveform.path.ecg")
                .font(.title2)
                .foregroundStyle(Color.rbAccent)

            Text("\(totalPlays)")
                .font(.system(size: 48, weight: .bold, design: .rounded))
                .foregroundStyle(Color.rbTextPrimary)

            Text("Total Plays Across All Artists")
                .font(.subheadline)
                .foregroundStyle(Color.rbTextSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .padding(.horizontal, 16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
                .opacity(0.6)
        )
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.rbSurface.opacity(0.5))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(
                    LinearGradient(
                        colors: [Color.rbAccent.opacity(0.4), Color.rbSurfaceLight],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
        .padding(.horizontal, 16)
    }

    // MARK: - Artist Summary Section

    @ViewBuilder
    private func artistSummarySection(_ artists: [LabelArtistDashboardItem]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "person.2.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.rbAccent)

                Text("Your Artists")
                    .font(.headline)
                    .foregroundStyle(Color.rbTextPrimary)

                Spacer()

                Text("\(artists.count) artists")
                    .font(.caption)
                    .foregroundStyle(Color.rbTextTertiary)
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(artists) { artist in
                        artistSummaryCard(artist)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func artistSummaryCard(_ artist: LabelArtistDashboardItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                if let urlString = artist.pictureUrl, let url = URL(string: urlString) {
                    AsyncImage(url: url) { image in
                        image
                            .resizable()
                            .scaledToFill()
                    } placeholder: {
                        ZStack {
                            Circle()
                                .fill(Color.rbSurface)
                            Image(systemName: "person.fill")
                                .font(.system(size: 14))
                                .foregroundStyle(Color.rbTextTertiary)
                        }
                    }
                    .frame(width: 40, height: 40)
                    .clipShape(Circle())
                } else {
                    ZStack {
                        Circle()
                            .fill(Color.rbSurface)
                        Image(systemName: "person.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(Color.rbTextTertiary)
                    }
                    .frame(width: 40, height: 40)
                }

                Text(artist.artistName)
                    .font(.headline)
                    .foregroundStyle(Color.rbTextPrimary)
                    .lineLimit(1)
            }

            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(artist.songCount)")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Color.rbAccent)
                    Text("Songs")
                        .font(.caption2)
                        .foregroundStyle(Color.rbTextTertiary)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("\(artist.totalPlays)")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Color.rbWarm)
                    Text("Plays")
                        .font(.caption2)
                        .foregroundStyle(Color.rbTextTertiary)
                }
            }

            if let topSong = artist.topSong {
                HStack(spacing: 4) {
                    Image(systemName: "crown.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(Color.rbWarm)

                    Text(topSong)
                        .font(.caption)
                        .foregroundStyle(Color.rbTextSecondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(14)
        .frame(width: 180, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.ultraThinMaterial)
                .opacity(0.6)
        )
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.rbSurface.opacity(0.5))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.rbSurfaceLight, lineWidth: 1)
        )
    }

    // MARK: - Catalog Songs Section

    @ViewBuilder
    private func catalogSongsSection(_ songs: [LabelCatalogSong]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: "music.note.list")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.rbAccent)

                Text("Catalog")
                    .font(.headline)
                    .foregroundStyle(Color.rbTextPrimary)

                Spacer()

                Text("\(songs.count) songs")
                    .font(.caption)
                    .foregroundStyle(Color.rbTextTertiary)
            }
            .padding(.horizontal, 16)

            LazyVStack(spacing: 0) {
                ForEach(Array(songs.enumerated()), id: \.element.id) { index, song in
                    catalogSongRow(song, rank: index + 1)

                    if index < songs.count - 1 {
                        Divider()
                            .overlay(Color.rbSurfaceLight.opacity(0.5))
                            .padding(.leading, 52)
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.ultraThinMaterial)
                .opacity(0.6)
        )
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.rbSurface.opacity(0.5))
        )
        .padding(.horizontal, 16)
    }

    private func catalogSongRow(_ song: LabelCatalogSong, rank: Int) -> some View {
        HStack(spacing: 12) {
            Text("\(rank)")
                .font(.headline)
                .foregroundStyle(Color.rbTextTertiary)
                .frame(width: 28, alignment: .trailing)

            VStack(alignment: .leading, spacing: 3) {
                Text(song.songTitle)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.rbTextPrimary)
                    .lineLimit(1)

                Text(song.artistName)
                    .font(.caption)
                    .foregroundStyle(Color.rbTextSecondary)
                    .lineLimit(1)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Text("\(song.totalPlays)")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.rbAccent)

                Text("\(song.stationCount) station\(song.stationCount == 1 ? "" : "s")")
                    .font(.caption2)
                    .foregroundStyle(Color.rbTextTertiary)
            }
        }
        .padding(.vertical, 10)
    }
}

#Preview {
    NavigationStack {
        LabelDashboardView()
    }
    .preferredColorScheme(.dark)
}
