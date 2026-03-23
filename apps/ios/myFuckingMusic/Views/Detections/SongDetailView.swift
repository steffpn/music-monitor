import SwiftUI

struct SongDetailView: View {
    let event: AirplayEvent
    @State private var viewModel = SongDetailViewModel()
    @State private var appearAnimation = false
    @Environment(AudioPlayerManager.self) private var audioPlayer

    private var isPlaying: Bool {
        audioPlayer.currentlyPlayingId == event.id && audioPlayer.isPlaying
    }

    var body: some View {
        ZStack {
            // Immersive gradient background from artwork colors
            backgroundGradient
                .ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 0) {
                    Spacer()
                        .frame(height: 20)

                    // Album artwork
                    artworkSection
                        .padding(.bottom, 28)

                    // Play snippet button
                    if event.snippetUrl != nil {
                        snippetPlayButton
                            .padding(.bottom, 20)
                    }

                    // Song info
                    songInfoSection
                        .padding(.bottom, 32)

                    // Streaming links
                    streamingLinksSection
                        .padding(.bottom, 28)

                    // Metadata cards
                    metadataSection
                        .padding(.bottom, 40)
                }
                .padding(.horizontal, 24)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task {
            await viewModel.loadArtwork(artist: event.artistName, title: event.songTitle)
            withAnimation(.easeOut(duration: 0.6)) {
                appearAnimation = true
            }
        }
    }

    // MARK: - Background Gradient

    private var backgroundGradient: some View {
        LinearGradient(
            stops: [
                .init(color: viewModel.dominantColors[0].opacity(0.7), location: 0.0),
                .init(color: viewModel.dominantColors[safe: 1]?.opacity(0.4) ?? .rbSurface.opacity(0.4), location: 0.3),
                .init(color: viewModel.dominantColors[safe: 2]?.opacity(0.2) ?? .rbBackground.opacity(0.2), location: 0.55),
                .init(color: .rbBackground, location: 0.85),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .animation(.easeInOut(duration: 0.8), value: viewModel.dominantColors.count)
    }

    // MARK: - Artwork Section

    private var artworkSection: some View {
        Group {
            if viewModel.isLoading {
                artworkPlaceholder
            } else if let image = viewModel.artworkImage {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 280, height: 280)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .shadow(color: viewModel.dominantColors[0].opacity(0.5), radius: 30, x: 0, y: 15)
                    .shadow(color: .black.opacity(0.4), radius: 20, x: 0, y: 10)
                    .scaleEffect(appearAnimation ? 1.0 : 0.9)
                    .opacity(appearAnimation ? 1.0 : 0.0)
            } else {
                artworkFallback
            }
        }
    }

    private var artworkPlaceholder: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(Color.rbSurfaceLight)
            .frame(width: 280, height: 280)
            .overlay {
                Image(systemName: "music.note")
                    .font(.system(size: 60))
                    .foregroundStyle(Color.rbTextTertiary)
                    .opacity(0.5)
            }
            .modifier(PulsingModifier())
    }

    private var artworkFallback: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [.rbSurfaceLight, .rbSurface],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 280, height: 280)
            .overlay {
                VStack(spacing: 12) {
                    Image(systemName: "music.note")
                        .font(.system(size: 50, weight: .light))
                        .foregroundStyle(Color.rbAccent.opacity(0.6))
                    Text("No Artwork")
                        .font(.caption)
                        .foregroundStyle(Color.rbTextTertiary)
                }
            }
            .shadow(color: .black.opacity(0.3), radius: 20, x: 0, y: 10)
    }

    // MARK: - Song Info Section

    private var songInfoSection: some View {
        VStack(spacing: 8) {
            Text(event.songTitle)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(Color.rbTextPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(3)

            Text(event.artistName)
                .font(.title3)
                .foregroundStyle(Color.rbTextSecondary)
                .multilineTextAlignment(.center)
                .lineLimit(2)

            if let albumTitle = viewModel.deezerTrack?.album?.title {
                Text(albumTitle)
                    .font(.subheadline)
                    .foregroundStyle(Color.rbTextTertiary)
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
                    .padding(.top, 2)
            }
        }
        .opacity(appearAnimation ? 1.0 : 0.0)
        .offset(y: appearAnimation ? 0 : 10)
    }

    // MARK: - Streaming Links Section

    private var streamingLinksSection: some View {
        HStack(spacing: 16) {
            if let isrc = event.isrc, !isrc.isEmpty {
                streamingButton(
                    title: "Spotify",
                    icon: "headphones",
                    color: Color(hex: "1DB954"),
                    url: "https://open.spotify.com/search/\(isrc)"
                )
            }

            if let deezerTrack = viewModel.deezerTrack {
                streamingButton(
                    title: "Deezer",
                    icon: "waveform",
                    color: Color(hex: "A238FF"),
                    url: "https://www.deezer.com/track/\(deezerTrack.id)"
                )
            }

            if let isrc = event.isrc, !isrc.isEmpty {
                streamingButton(
                    title: "YouTube",
                    icon: "play.rectangle.fill",
                    color: Color(hex: "FF0000"),
                    url: "https://music.youtube.com/search?q=\(event.artistName) \(event.songTitle)"
                        .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
                )
            }
        }
        .opacity(appearAnimation ? 1.0 : 0.0)
    }

    private func streamingButton(title: String, icon: String, color: Color, url: String) -> some View {
        Link(destination: URL(string: url) ?? URL(string: "https://example.com")!) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(color)
                    .frame(width: 48, height: 48)
                    .background(color.opacity(0.15))
                    .clipShape(Circle())

                Text(title)
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundStyle(Color.rbTextSecondary)
            }
        }
    }

    // MARK: - Metadata Section

    private var metadataSection: some View {
        VStack(spacing: 12) {
            // Station + Detection Time
            if let stationName = event.station?.name {
                metadataCard(
                    icon: "antenna.radiowaves.left.and.right",
                    title: "Station",
                    value: stationName,
                    subtitle: DateFormatters.shortDateTime(event.startedAt)
                )
            }

            // Duration
            let durationSeconds = durationInSeconds
            if durationSeconds > 0 {
                metadataCard(
                    icon: "clock",
                    title: "Duration",
                    value: formatDuration(durationSeconds),
                    subtitle: nil
                )
            }

            // Deezer track duration
            if let deezerDuration = viewModel.deezerTrack?.duration, deezerDuration > 0 {
                metadataCard(
                    icon: "music.note.list",
                    title: "Track Length",
                    value: formatDuration(deezerDuration),
                    subtitle: nil
                )
            }

            // ISRC
            if let isrc = event.isrc, !isrc.isEmpty {
                metadataCard(
                    icon: "barcode",
                    title: "ISRC",
                    value: isrc,
                    subtitle: nil
                )
            }

            // Play count
            if event.playCount > 0 {
                metadataCard(
                    icon: "arrow.triangle.2.circlepath",
                    title: "Play Count",
                    value: "\(event.playCount)",
                    subtitle: nil
                )
            }
        }
        .opacity(appearAnimation ? 1.0 : 0.0)
        .offset(y: appearAnimation ? 0 : 15)
    }

    private func metadataCard(icon: String, title: String, value: String, subtitle: String?) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(Color.rbAccent)
                .frame(width: 36, height: 36)
                .background(Color.rbAccent.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption)
                    .foregroundStyle(Color.rbTextTertiary)

                Text(value)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(Color.rbTextPrimary)

                if let subtitle {
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(Color.rbTextTertiary)
                }
            }

            Spacer()
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(.ultraThinMaterial)
                .opacity(0.6)
        )
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.rbSurface.opacity(0.5))
        )
    }

    // MARK: - Snippet Play Button

    private var snippetPlayButton: some View {
        Button {
            Task { await audioPlayer.play(eventId: event.id) }
        } label: {
            HStack(spacing: 12) {
                if audioPlayer.currentlyPlayingId == event.id && audioPlayer.isLoadingSnippet {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 16, weight: .bold))
                }

                Text(isPlaying ? "Playing Broadcast" : "Play Broadcast Proof")
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(.black)
            .padding(.horizontal, 32)
            .padding(.vertical, 14)
            .background(LinearGradient.rbAccentGradient)
            .clipShape(Capsule())
            .shadow(color: Color.rbAccent.opacity(0.4), radius: 12, x: 0, y: 6)
        }
        .opacity(appearAnimation ? 1.0 : 0.0)
        .scaleEffect(appearAnimation ? 1.0 : 0.9)
    }

    // MARK: - Helpers

    private var durationInSeconds: Int {
        let interval = event.endedAt.timeIntervalSince(event.startedAt)
        return max(0, Int(interval))
    }

    private func formatDuration(_ totalSeconds: Int) -> String {
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Safe Array Subscript

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

// MARK: - Pulsing Loading Modifier

private struct PulsingModifier: ViewModifier {
    @State private var isPulsing = false

    func body(content: Content) -> some View {
        content
            .opacity(isPulsing ? 0.4 : 0.8)
            .animation(
                .easeInOut(duration: 1.0).repeatForever(autoreverses: true),
                value: isPulsing
            )
            .onAppear { isPulsing = true }
    }
}

#Preview {
    NavigationStack {
        SongDetailView(
            event: AirplayEvent(
                id: 1,
                stationId: 1,
                startedAt: Date().addingTimeInterval(-180),
                endedAt: Date(),
                songTitle: "Blinding Lights",
                artistName: "The Weeknd",
                isrc: "USUG12000497",
                confidence: nil,
                playCount: 3,
                snippetUrl: nil,
                createdAt: Date(),
                station: AirplayEvent.StationInfo(name: "Radio Capital")
            )
        )
    }
    .preferredColorScheme(.dark)
}
