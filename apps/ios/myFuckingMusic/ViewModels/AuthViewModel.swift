import Foundation

/// Manages onboarding and login form state.
/// Coordinates with AuthManager for actual auth operations.
@MainActor
@Observable
final class AuthViewModel {
    // MARK: - Form Fields

    var inviteCode: String = ""
    var email: String = ""
    var password: String = ""
    var confirmPassword: String = ""
    var name: String = ""

    // MARK: - State

    var errorMessage: String?
    var isSubmitting: Bool = false

    // MARK: - Dependencies

    private var authManager: AuthManager?

    func configure(authManager: AuthManager) {
        self.authManager = authManager
    }

    // MARK: - Invite Code Validation

    /// Validate invite code format: XXXX-XXXX-XXXX (uppercase hex, 14 chars with dashes)
    var isInviteCodeValid: Bool {
        let stripped = inviteCode.replacingOccurrences(of: "-", with: "")
        guard stripped.count == 12 else { return false }
        return stripped.allSatisfy { $0.isHexDigit }
    }

    /// Format the invite code as user types: XXXX-XXXX-XXXX
    var formattedInviteCode: String {
        let stripped = inviteCode
            .uppercased()
            .replacingOccurrences(of: "-", with: "")
            .filter { $0.isHexDigit }
            .prefix(12)

        var result = ""
        for (index, char) in stripped.enumerated() {
            if index > 0 && index % 4 == 0 {
                result += "-"
            }
            result.append(char)
        }
        return result
    }

    // MARK: - Registration

    /// Register a new user with the stored invite code and form fields.
    func register() async {
        guard let authManager else { return }

        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        // Client-side validation
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Please enter your name"
            return
        }

        guard !email.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Please enter your email"
            return
        }

        guard password.count >= 8 else {
            errorMessage = "Password must be at least 8 characters"
            return
        }

        guard password == confirmPassword else {
            errorMessage = "Passwords do not match"
            return
        }

        // Format the code for the backend: XXXX-XXXX-XXXX (14 chars)
        let code = formattedInviteCode

        do {
            try await authManager.register(
                code: code,
                email: email.trimmingCharacters(in: .whitespaces),
                password: password,
                name: name.trimmingCharacters(in: .whitespaces)
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Login

    /// Login with email and password.
    func login() async {
        guard let authManager else { return }

        errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        guard !email.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Please enter your email"
            return
        }

        guard !password.isEmpty else {
            errorMessage = "Please enter your password"
            return
        }

        do {
            try await authManager.login(
                email: email.trimmingCharacters(in: .whitespaces),
                password: password
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Reset

    /// Clear all form fields and error state.
    func reset() {
        inviteCode = ""
        email = ""
        password = ""
        confirmPassword = ""
        name = ""
        errorMessage = nil
        isSubmitting = false
    }
}
