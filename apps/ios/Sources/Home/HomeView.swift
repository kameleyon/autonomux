import SwiftUI

struct Skill: Identifiable {
    let id = UUID()
    let mark: String
    let name: String
    let desc: String
}

/// Signed-in home — "Talk to your AlterEgo" over the blaze, with the sub-agent
/// skill cards in a responsive grid (2-up on wide screens, 1-up on iPhone).
struct HomeView: View {
    @EnvironmentObject private var supabase: SupabaseManager

    private let skills: [Skill] = [
        .init(mark: "M", name: "Mailroom", desc: "Triage the inbox — pull recent mail and rank it by what actually matters."),
        .init(mark: "S", name: "Scheduler", desc: "Read the calendar, surface today and tomorrow, flag the conflicts."),
        .init(mark: "W", name: "Scribe", desc: "Draft, edit, and post articles in your voice — then publish on command."),
        .init(mark: "O", name: "Oracle", desc: "Pull a card. Read the day, the week, the money lane — cardology + astrology."),
        .init(mark: "T", name: "Treasurer", desc: "Map the money — lanes, runway, and what this week is quietly carrying."),
        .init(mark: "I", name: "Studio", desc: "Generate an image or short video from a prompt, framed for where it's going."),
    ]

    var body: some View {
        ZStack {
            Brand.blaze.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    hero
                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 260), spacing: 12)],
                        spacing: 12
                    ) {
                        ForEach(skills) { SkillCard(skill: $0) }
                    }
                    composer
                }
                .padding(20)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
        }
        .safeAreaInset(edge: .top) { topBar }
    }

    private var topBar: some View {
        HStack {
            Text("autonomux").font(BrandFont.display(22)).foregroundStyle(Brand.cream)
            Spacer()
            Button { Task { await supabase.signOut() } } label: {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .foregroundStyle(Brand.cream.opacity(0.85))
            }
            .accessibilityLabel("Log out")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private var hero: some View {
        VStack(spacing: 10) {
            Text("Talk to your AlterEgo.")
                .font(BrandFont.display(40))
                .foregroundStyle(Brand.cream)
                .multilineTextAlignment(.center)
            Text("I'm you — with more time, a longer memory, and a way into your inbox, calendar, cards, and money. Type, talk, or hand me a task.")
                .font(.body)
                .foregroundStyle(Brand.cream.opacity(0.9))
                .multilineTextAlignment(.center)
        }
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    private var composer: some View {
        HStack {
            Text("Ask AlterEgo anything — or type / to hand off a task.")
                .foregroundStyle(Brand.muted)
                .lineLimit(1)
            Spacer(minLength: 8)
            Image(systemName: "arrow.up.circle.fill")
                .foregroundStyle(Brand.orange)
                .font(.title2)
        }
        .padding(16)
        .background(Brand.cream)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct SkillCard: View {
    let skill: Skill

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text(skill.mark)
                    .font(BrandFont.mono(13))
                    .foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(Brand.orange)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Text(skill.name).font(.headline).foregroundStyle(Brand.cream)
            }
            Text(skill.desc)
                .font(.subheadline)
                .foregroundStyle(Brand.cream.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.14)))
    }
}
