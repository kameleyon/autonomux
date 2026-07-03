import SwiftUI

/// autonomux brand tokens — warm-only palette, mirrored from the web app.
/// Fonts fall back to the system face until the brand fonts are bundled
/// (see BUILD_GUIDE.md → "Fonts").
enum Brand {
    static let orange = Color(hex: 0xF26B1A)
    static let orangeSoft = Color(hex: 0xFF9050)
    static let red = Color(hex: 0xE63312)
    static let redDeep = Color(hex: 0xB81F00)
    static let wine = Color(hex: 0x7A2010)
    static let cream = Color(hex: 0xFFF8F3)
    static let ink = Color(hex: 0x1A1410)
    static let inkSoft = Color(hex: 0x3A302A)
    static let muted = Color(hex: 0x6B5F54)

    /// The signed-in "blaze" — the fiery red→orange wash behind the app.
    static let blaze = LinearGradient(
        colors: [Color(hex: 0xC43811), Color(hex: 0xB02810), Color(hex: 0x8A1A08), Color(hex: 0x5A0E06)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

enum BrandFont {
    static func display(_ size: CGFloat) -> Font { .custom("Cormorant Garamond", size: size) }
    static func body(_ size: CGFloat) -> Font { .custom("Inter", size: size) }
    static func mono(_ size: CGFloat) -> Font { .custom("DM Mono", size: size) }
}

extension Color {
    init(hex: UInt, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}
