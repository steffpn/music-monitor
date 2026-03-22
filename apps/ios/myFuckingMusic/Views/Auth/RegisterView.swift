import SwiftUI

struct RegisterView: View {
    @Environment(AuthViewModel.self) private var viewModel
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""

    var body: some View {
        ZStack {
            Color.rbBackground
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    Image(systemName: "person.badge.plus")
                        .font(.system(size: 48))
                        .foregroundStyle(Color.rbAccent)
                        .padding(.top, 24)

                    Text("Create Account")
                        .font(.title2.bold())
                        .foregroundStyle(Color.rbTextPrimary)

                    VStack(spacing: 16) {
                        TextField("Name", text: $name)
                            .textContentType(.name)
                            .textInputAutocapitalization(.words)
                            .modifier(AuthFieldStyle())

                        TextField("Email", text: $email)
                            .keyboardType(.emailAddress)
                            .textContentType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .modifier(AuthFieldStyle())

                        SecureField("Password (min 8 chars)", text: $password)
                            .textContentType(.newPassword)
                            .modifier(AuthFieldStyle())

                        SecureField("Confirm Password", text: $confirmPassword)
                            .textContentType(.newPassword)
                            .modifier(AuthFieldStyle())
                    }
                    .padding(.horizontal, 24)

                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .padding(.horizontal, 24)
                    }

                    Button {
                        viewModel.name = name
                        viewModel.email = email
                        viewModel.password = password
                        viewModel.confirmPassword = confirmPassword
                        Task { await viewModel.register() }
                    } label: {
                        Group {
                            if viewModel.isSubmitting {
                                ProgressView().tint(.white)
                            } else {
                                Text("Create Account")
                            }
                        }
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.rbAccent)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(viewModel.isSubmitting)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 48)
                }
            }
        }
        .navigationTitle("Register")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
    }
}

/// Lightweight text field styling — single background, no overlay/clipShape stack.
private struct AuthFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(12)
            .foregroundStyle(Color.rbTextPrimary)
            .background(Color.rbSurface, in: RoundedRectangle(cornerRadius: 10))
    }
}

#Preview {
    NavigationStack {
        RegisterView()
            .environment(AuthViewModel())
    }
}
