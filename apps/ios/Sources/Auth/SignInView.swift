import SwiftUI

/// Email + password sign-in / sign-up against the shared Supabase backend.
/// Mirrors the web auth copy and flow. Fully responsive (constrained to a
/// readable column on iPad, full width on iPhone).
struct SignInView: View {
    @EnvironmentObject private var supabase: SupabaseManager

    enum Mode {
        case signIn, signUp
        var title: String { self == .signIn ? "Welcome back" : "Create your account" }
        var subtitle: String {
            self == .signIn
                ? "Sign in to pick up where your AlterEgo left off."
                : "Set up your AlterEgo in under a minute."
        }
        var cta: String { self == .signIn ? "Sign in" : "Create account" }
        var swap: String { self == .signIn ? "Don't have an account?" : "Already have an account?" }
        var swapCta: String { self == .signIn ? "Sign up" : "Sign in" }
    }

    @State private var mode: Mode = .signIn
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var isBusy = false
    @State private var errorText: String?

    private let field = Color(hex: 0xFBF7F1)
    private let border = Color(hex: 0xDDD0BD)

    var body: some View {
        ZStack {
            Brand.cream.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    if mode == .signUp {
                        labeledField("Full name", text: $name, content: .name, keyboard: .default, caps: .words)
                    }
                    labeledField("Email", text: $email, content: .emailAddress, keyboard: .emailAddress, caps: .never)
                    labeledSecure("Password")
                    if let errorText {
                        Text(errorText).font(.footnote).foregroundStyle(Brand.red)
                    }
                    submitButton
                    swapRow
                }
                .padding(24)
                .frame(maxWidth: 420)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("autonomux").font(BrandFont.display(26)).foregroundStyle(Brand.ink)
            Text(mode.title).font(BrandFont.display(34)).foregroundStyle(Brand.ink)
            Text(mode.subtitle).font(.callout).foregroundStyle(Brand.muted)
        }
        .padding(.bottom, 6)
    }

    private func labeledField(
        _ label: String,
        text: Binding<String>,
        content: UITextContentType,
        keyboard: UIKeyboardType,
        caps: TextInputAutocapitalization
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.subheadline.weight(.medium)).foregroundStyle(Brand.inkSoft)
            TextField("", text: text)
                .keyboardType(keyboard)
                .textContentType(content)
                .textInputAutocapitalization(caps)
                .autocorrectionDisabled()
                .padding(14)
                .background(field)
                .clipShape(RoundedRectangle(cornerRadius: 11))
                .overlay(RoundedRectangle(cornerRadius: 11).stroke(border))
        }
    }

    private func labeledSecure(_ label: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.subheadline.weight(.medium)).foregroundStyle(Brand.inkSoft)
            SecureField("", text: $password)
                .textContentType(mode == .signIn ? .password : .newPassword)
                .padding(14)
                .background(field)
                .clipShape(RoundedRectangle(cornerRadius: 11))
                .overlay(RoundedRectangle(cornerRadius: 11).stroke(border))
        }
    }

    private var submitButton: some View {
        Button(action: submit) {
            HStack(spacing: 8) {
                if isBusy { ProgressView().tint(.white) }
                Text(mode.cta).font(.headline)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(Brand.orange)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 11))
        }
        .disabled(isBusy || email.isEmpty || password.isEmpty)
        .opacity(isBusy || email.isEmpty || password.isEmpty ? 0.7 : 1)
    }

    private var swapRow: some View {
        HStack(spacing: 4) {
            Text(mode.swap).foregroundStyle(Brand.muted)
            Button(mode.swapCta) {
                withAnimation { mode = mode == .signIn ? .signUp : .signIn; errorText = nil }
            }
            .foregroundStyle(Brand.redDeep)
            .fontWeight(.semibold)
        }
        .font(.subheadline)
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    private func submit() {
        errorText = nil
        isBusy = true
        Task {
            do {
                if mode == .signIn {
                    try await supabase.signIn(email: email, password: password)
                } else {
                    try await supabase.signUp(email: email, password: password)
                }
            } catch {
                errorText = error.localizedDescription
            }
            isBusy = false
        }
    }
}
