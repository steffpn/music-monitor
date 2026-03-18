import AVFoundation
import Foundation

/// Manages single-active audio snippet playback via AVPlayer.
/// Only one snippet can play at a time across the entire app.
/// Uses presigned URLs fetched from the backend for each snippet.
@Observable
@MainActor
final class AudioPlayerManager {
    // MARK: - Public State

    /// ID of the event currently being played (or loading).
    var currentlyPlayingId: Int?

    /// Playback progress from 0.0 to 1.0.
    var playbackProgress: Double = 0

    /// Whether audio is currently playing.
    var isPlaying: Bool = false

    /// Whether a snippet URL is being fetched from the API.
    var isLoadingSnippet: Bool = false

    /// Error message from the last play attempt.
    var error: String?

    /// Current playback time in seconds.
    var currentTime: Double = 0

    /// Total duration of the snippet in seconds.
    var duration: Double = 0

    // MARK: - Private State

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?

    // MARK: - Public Methods

    /// Play, pause, or resume snippet for the given event.
    /// - If currently playing this event: pause.
    /// - If paused on this event: resume.
    /// - Otherwise: stop current, fetch presigned URL, and play new snippet.
    func play(eventId: Int) async {
        // Toggle pause/resume if same event
        if currentlyPlayingId == eventId {
            if isPlaying {
                pause()
                return
            } else if player != nil {
                resume()
                return
            }
        }

        // Stop any current playback
        stop()

        // Start loading new snippet
        currentlyPlayingId = eventId
        isLoadingSnippet = true
        error = nil

        do {
            print("[AudioPlayer] Fetching snippet for eventId=\(eventId), snippetUrl check passed")
            // Fetch fresh presigned URL from backend
            let response: SnippetUrlResponse = try await APIClient.shared.request(
                .snippetUrl(eventId: eventId)
            )

            isLoadingSnippet = false

            guard let audioUrl = URL(string: response.url) else {
                error = "Invalid audio URL"
                stop()
                return
            }

            // Verify we are still supposed to play this event (user may have tapped another)
            guard currentlyPlayingId == eventId else { return }

            // Configure audio session for playback
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)

            // Create player
            let playerItem = AVPlayerItem(url: audioUrl)
            let newPlayer = AVPlayer(playerItem: playerItem)
            player = newPlayer

            // Add periodic time observer (every 0.1s)
            let interval = CMTime(seconds: 0.1, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
            timeObserver = newPlayer.addPeriodicTimeObserver(
                forInterval: interval,
                queue: .main
            ) { [weak self] time in
                Task { @MainActor in
                    guard let self else { return }
                    let current = CMTimeGetSeconds(time)
                    let total = CMTimeGetSeconds(newPlayer.currentItem?.duration ?? .zero)
                    if total.isFinite && total > 0 {
                        self.currentTime = current
                        self.duration = total
                        self.playbackProgress = current / total
                    }
                }
            }

            // Observe playback end
            endObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: playerItem,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    self?.stop()
                }
            }

            // Start playback
            newPlayer.play()
            isPlaying = true

        } catch is CancellationError {
            // View disappeared during URL fetch -- silently stop
            stop()
        } catch {
            isLoadingSnippet = false
            self.error = error.localizedDescription
            print("[AudioPlayer] ERROR playing eventId=\(eventId): \(error)")
            stop()
        }
    }

    /// Pause current playback.
    func pause() {
        player?.pause()
        isPlaying = false
    }

    /// Resume paused playback.
    func resume() {
        player?.play()
        isPlaying = true
    }

    /// Stop playback and reset all state.
    func stop() {
        // Remove time observer
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
        timeObserver = nil

        // Remove end-of-playback observer
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
        }
        endObserver = nil

        // Stop and release player
        player?.pause()
        player = nil

        // Reset state
        currentlyPlayingId = nil
        isPlaying = false
        playbackProgress = 0
        currentTime = 0
        duration = 0
        isLoadingSnippet = false
    }
}
