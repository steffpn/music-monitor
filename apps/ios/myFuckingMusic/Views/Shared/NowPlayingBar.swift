import SwiftUI

/// Floating mini-player bar shown at the bottom of the screen while a broadcast snippet plays.
/// Shows progress, song info, detection marker at 50% (15s mark), and play/stop controls.
struct NowPlayingBar: View {
    @Environment(AudioPlayerManager.self) private var player

    /// Detection happens at the midpoint (15s into a 30s clip)
    private let detectionPoint: Double = 0.5

    var body: some View {
        if player.currentlyPlayingId != nil && !player.isLoadingSnippet {
            VStack(spacing: 0) {
                // Progress bar with detection marker
                progressBar

                // Controls
                HStack(spacing: 12) {
                    // Waveform icon
                    Image(systemName: "waveform")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.rbAccent)

                    // Info
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Broadcast Proof")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.rbTextPrimary)

                        Text(timeLabel)
                            .font(.caption2)
                            .foregroundStyle(Color.rbTextTertiary)
                    }

                    Spacer()

                    // Detection marker label
                    if player.playbackProgress < detectionPoint {
                        Text("Song detected in \(secondsUntilDetection)s")
                            .font(.caption2)
                            .foregroundStyle(Color.rbAccent)
                            .transition(.opacity)
                    } else {
                        Text("Song detected ✓")
                            .font(.caption2)
                            .foregroundStyle(Color.rbLive)
                            .transition(.opacity)
                    }

                    // Play/Pause
                    Button {
                        if player.isPlaying {
                            player.pause()
                        } else {
                            player.resume()
                        }
                    } label: {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(Color.rbTextPrimary)
                    }

                    // Stop
                    Button {
                        player.stop()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Color.rbTextTertiary)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            .background(
                Color.rbSurface
                    .shadow(color: .black.opacity(0.3), radius: 10, y: -5)
            )
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .animation(.easeInOut(duration: 0.3), value: player.currentlyPlayingId)
        }
    }

    // MARK: - Progress Bar

    private var progressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                // Background track
                Rectangle()
                    .fill(Color.rbSurfaceLight)

                // Progress fill
                Rectangle()
                    .fill(Color.rbAccent)
                    .frame(width: geo.size.width * player.playbackProgress)

                // Detection point marker
                Rectangle()
                    .fill(Color.rbWarm)
                    .frame(width: 2)
                    .offset(x: geo.size.width * detectionPoint - 1)
            }
        }
        .frame(height: 3)
    }

    // MARK: - Helpers

    private var timeLabel: String {
        let current = Int(player.currentTime)
        let total = Int(player.duration)
        return "\(current)s / \(total)s"
    }

    private var secondsUntilDetection: Int {
        let detectionTime = player.duration * detectionPoint
        return max(0, Int(detectionTime - player.currentTime))
    }
}
