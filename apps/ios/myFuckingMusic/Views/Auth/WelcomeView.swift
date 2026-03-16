import SwiftUI

/// Full-screen welcome splash shown on first launch.
/// Provides navigation to invite code entry or login.
struct WelcomeView: View {
    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // App icon
            Image(systemName: "music.note.list")
                .font(.system(size: 80))
                .foregroundStyle(.tint)

            // App title
            VStack(spacing: 8) {
                Text("myFuckingMusic")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Radio & TV Detection Dashboard")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Navigation buttons
            VStack(spacing: 16) {
                NavigationLink {
                    InviteCodeView()
                } label: {
                    Text("I have an invite code")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.blue)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                NavigationLink {
                    LoginView()
                } label: {
                    Text("Already have an account? Log in")
                        .font(.subheadline)
                        .foregroundStyle(.blue)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 48)
        }
        .navigationBarBackButtonHidden(true)
    }
}

#Preview {
    NavigationStack {
        WelcomeView()
    }
}
