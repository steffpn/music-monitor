import SwiftUI

struct InviteCodeView: View {
    @Environment(AuthViewModel.self) private var viewModel
    @State private var inviteCode = ""

    var body: some View {
        ZStack {
            Color.rbBackground
                .ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "ticket")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.rbAccent)

                Text("Enter Invite Code")
                    .font(.title2.bold())
                    .foregroundStyle(Color.rbTextPrimary)

                Text("Enter the code you received to create your account")
                    .font(.subheadline)
                    .foregroundStyle(Color.rbTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                TextField("XXXX-XXXX-XXXX", text: $inviteCode)
                    .font(.title3.monospaced())
                    .multilineTextAlignment(.center)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .padding(14)
                    .foregroundStyle(Color.rbTextPrimary)
                    .background(Color.rbSurface, in: RoundedRectangle(cornerRadius: 10))
                    .padding(.horizontal, 48)
                    .onChange(of: inviteCode) { _, newValue in
                        viewModel.inviteCode = newValue.uppercased()
                    }

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }

                Spacer()

                NavigationLink {
                    RegisterView()
                } label: {
                    Text("Continue")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(viewModel.isInviteCodeValid ? Color.rbAccent : Color.rbSurfaceLight)
                        .foregroundStyle(viewModel.isInviteCodeValid ? .white : Color.rbTextTertiary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(!viewModel.isInviteCodeValid)
                .padding(.horizontal, 24)
                .padding(.bottom, 48)
            }
        }
        .navigationTitle("Invite Code")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .onAppear { inviteCode = viewModel.inviteCode }
    }
}

#Preview {
    NavigationStack {
        InviteCodeView()
            .environment(AuthViewModel())
    }
}
