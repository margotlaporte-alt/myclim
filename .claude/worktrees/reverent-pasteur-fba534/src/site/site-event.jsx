import { NavLink } from "react-router-dom";

const TIMETABLE = [
  { time: "08:00", event: "Venue opens", detail: "Athlete check-in and warm-up area available" },
  { time: "09:00", event: "Field events start", detail: "High Jump, Long Jump, Shot Put, Pole Vault" },
  { time: "10:30", event: "Track events begin", detail: "60 m, 60 m Hurdles, 200 m heats" },
  { time: "12:00", event: "Doors open — public", detail: "Public access to Coque arena" },
  { time: "13:30", event: "Afternoon session", detail: "400 m, 800 m, 1500 m, Mile" },
  { time: "16:00", event: "Finals session", detail: "All sprint and hurdle finals" },
  { time: "17:30", event: "VIP reception", detail: "Partners and VIP lounge opens" },
  { time: "18:00", event: "Evening programme", detail: "Elite 60 m, 3000 m, Pole Vault final" },
  { time: "20:00", event: "Medal ceremony & close", detail: "End of competition, venue closes" },
];

const INFO_CARDS = [
  {
    icon: "📅",
    title: "Date",
    content: "18 January 2026",
    sub: "Doors open at 12:00",
  },
  {
    icon: "🏟️",
    title: "Venue",
    content: "Coque, Luxembourg",
    sub: "2, rue Léon Hengen, L-1745 Luxembourg",
  },
  {
    icon: "🚌",
    title: "Access",
    content: "Bus lines 2, 18, 30",
    sub: "Free public transport on competition day",
  },
];

function InfoCard({ icon, title, content, sub }) {
  return (
    <div className="site-event-info-card">
      <div className="site-event-info-card__icon">{icon}</div>
      <h3>{title}</h3>
      <p>{content}</p>
      {sub && <p style={{ fontSize: "0.82rem", marginTop: 4, color: "var(--site-text-dim)" }}>{sub}</p>}
    </div>
  );
}

function SectionTitle({ eyebrow, title, lead }) {
  return (
    <div className="site-section-header">
      <span className="site-eyebrow">{eyebrow}</span>
      <h2 className="site-heading site-heading--sm">{title}</h2>
      {lead && <p className="site-lead">{lead}</p>}
    </div>
  );
}

export function SiteEvent() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="site-event-hero">
        <div className="site-container">
          <span className="site-eyebrow">Practical information</span>
          <h1 className="site-heading">The Event</h1>
          <p className="site-lead">
            Everything you need to know to attend, participate or follow the CMCM Luxembourg Indoor Meeting — your complete guide to the event.
          </p>

          <div className="site-event-info-grid">
            {INFO_CARDS.map((card) => (
              <InfoCard key={card.title} {...card} />
            ))}
          </div>
        </div>
      </section>

      {/* ── About ────────────────────────────────────────── */}
      <section className="site-section">
        <div className="site-container">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "start" }}>
            <div>
              <SectionTitle
                eyebrow="About the event"
                title="World-class athletics in the heart of Europe"
                lead="The CMCM Luxembourg Indoor Meeting gathers elite track and field athletes for a full day of international competition at one of Europe's finest indoor athletics venues."
              />
              <p style={{ color: "var(--site-text-muted)", lineHeight: 1.75, marginBottom: 16 }}>
                Since 2003, the meeting has established itself as a key stop on the European indoor athletics circuit. Held at Coque — Luxembourg's national sports and culture centre — the event offers both elite athletes and spectators an exceptional experience.
              </p>
              <p style={{ color: "var(--site-text-muted)", lineHeight: 1.75, marginBottom: 32 }}>
                The meeting holds a World Athletics Indoor Tour Silver label, placing it among the top indoor athletics events on the continent.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <NavLink to="/statistics" className="site-btn site-btn--primary site-btn--sm">
                  View results &amp; records
                </NavLink>
                <a
                  href="https://www.worldathletics.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="site-btn site-btn--secondary site-btn--sm"
                >
                  World Athletics
                </a>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                ["Disciplines", "Sprint (60m, 200m, 400m), hurdles, middle distance, throws, jumps"],
                ["Competition format", "Heats and finals across all disciplines in a single day"],
                ["Athletes", "International elite athletes + national champions"],
                ["Broadcast", "Livestream available — check our social media for links"],
                ["Officials", "World Athletics certified technical officials"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    padding: "20px 24px",
                    background: "var(--site-card)",
                    border: "1px solid var(--site-border)",
                    borderRadius: "var(--site-radius-sm)",
                    display: "grid",
                    gridTemplateColumns: "140px 1fr",
                    gap: 16,
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--site-text-muted)" }}>
                    {label}
                  </span>
                  <span style={{ fontSize: "0.9rem", color: "var(--site-text)", lineHeight: 1.5 }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Timetable ─────────────────────────────────────── */}
      <section className="site-section site-section--alt" id="timetable">
        <div className="site-container">
          <SectionTitle
            eyebrow="Programme"
            title="Event timetable"
            lead="Approximate schedule for competition day. Times may be adjusted — please check the official programme closer to the event."
          />

          <div className="site-card" style={{ overflow: "hidden" }}>
            <div className="site-timetable">
              {TIMETABLE.map((row, i) => (
                <div key={i} className="site-timetable__row">
                  <div className="site-timetable__time">{row.time}</div>
                  <div className="site-timetable__event">
                    <strong>{row.event}</strong>
                    <span>{row.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Tickets ───────────────────────────────────────── */}
      <section className="site-section" id="tickets">
        <div className="site-container">
          <SectionTitle
            eyebrow="Attend the meeting"
            title="Tickets &amp; access"
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {[
              {
                label: "General admission",
                price: "Free",
                color: "var(--site-blue)",
                description: "Free entry for all spectators. First-come, first-served seating in the general area.",
                cta: null,
                ctaLabel: null,
              },
              {
                label: "VIP Experience",
                price: "On request",
                color: "var(--site-gold)",
                description: "Premium seats, exclusive lounge access, catering and meet-the-athletes opportunities.",
                cta: "/vip",
                ctaLabel: "Discover VIP →",
              },
              {
                label: "Group bookings",
                price: "Contact us",
                color: "var(--site-red)",
                description: "Special arrangements for schools, clubs and corporate groups. Contact us for details.",
                cta: "mailto:contact@luxembourg-indoor-meeting.lu",
                ctaLabel: "Contact us →",
              },
            ].map((tier) => (
              <div
                key={tier.label}
                className="site-card"
                style={{ padding: 32 }}
              >
                <div style={{
                  width: 48,
                  height: 4,
                  background: tier.color,
                  borderRadius: 2,
                  marginBottom: 24,
                }} />
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--site-text)", marginBottom: 6 }}>
                  {tier.label}
                </h3>
                <div style={{ fontSize: "1.8rem", fontWeight: 900, color: tier.color, marginBottom: 16, lineHeight: 1 }}>
                  {tier.price}
                </div>
                <p style={{ fontSize: "0.875rem", lineHeight: 1.65, marginBottom: 24 }}>
                  {tier.description}
                </p>
                {tier.cta && (
                  <a href={tier.cta} className="site-btn site-btn--secondary site-btn--sm">
                    {tier.ctaLabel}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Livestream ────────────────────────────────────── */}
      <section className="site-section site-section--alt" id="livestream">
        <div className="site-container">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
            <div>
              <SectionTitle
                eyebrow="Aftermovie · 2025 Edition"
                title="Relive the meeting"
                lead="Watch the aftermovie of the last edition. Livestream of the next edition will be available on competition day."
              />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <a
                  href="https://www.youtube.com/@LuxembourgIndoorMeeting"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="site-btn site-btn--primary site-btn--sm"
                >
                  ▶ YouTube channel
                </a>
                <NavLink to="/statistics" className="site-btn site-btn--secondary site-btn--sm">
                  Results &amp; records
                </NavLink>
              </div>
            </div>
            <div style={{
              position: "relative",
              borderRadius: "var(--site-radius-lg)",
              overflow: "hidden",
              border: "1px solid var(--site-border)",
              aspectRatio: "16/9",
              boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
            }}>
              <iframe
                width="100%"
                height="100%"
                src="https://www.youtube.com/embed/-SUlwo3DvcA?si=0boLsF9A59C0c5zD"
                title="CMCM Luxembourg Indoor Meeting — Aftermovie"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Volunteer ─────────────────────────────────────── */}
      <section className="site-section" id="volunteer">
        <div className="site-container">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
            <div
              style={{
                background: "linear-gradient(135deg, rgba(16,102,204,0.2), rgba(232,0,28,0.15))",
                border: "1px solid var(--site-border)",
                borderRadius: "var(--site-radius-lg)",
                aspectRatio: "4/3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "4rem",
              }}
            >
              🙋
            </div>
            <div>
              <SectionTitle
                eyebrow="Get involved"
                title="Become a volunteer"
                lead="Join our team of volunteers and contribute to making the CMCM Luxembourg Indoor Meeting an unforgettable event."
              />
              <p style={{ color: "var(--site-text-muted)", lineHeight: 1.75, marginBottom: 24 }}>
                Each year, over 100 volunteers ensure the smooth running of the event — from athlete escort to timing, accreditation, hospitality and media support. It's an incredible experience and a great way to contribute to Luxembourg athletics.
              </p>
              <a href="/volunteer-apply" className="site-btn site-btn--primary site-btn--sm">
                Apply to volunteer →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Sustainability ────────────────────────────────── */}
      <section className="site-section site-section--alt">
        <div className="site-container">
          <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
            <span className="site-eyebrow">Our commitment</span>
            <h2 className="site-heading site-heading--sm">Sustainability</h2>
            <p style={{ color: "var(--site-text-muted)", fontSize: "1.05rem", lineHeight: 1.75, marginTop: 16 }}>
              The CMCM Luxembourg Indoor Meeting is committed to reducing its environmental impact. We work with partners and suppliers who share our values, encourage public transport use, minimise single-use plastics and offset unavoidable emissions. Sport has a role to play in building a more sustainable future — and we take that responsibility seriously.
            </p>
            <div style={{
              display: "flex",
              justifyContent: "center",
              gap: 32,
              marginTop: 40,
              flexWrap: "wrap",
            }}>
              {[
                ["🚌", "Public transport encouraged"],
                ["♻️", "Zero single-use plastic"],
                ["🌱", "Carbon offset programme"],
                ["💧", "Water station on site"],
              ].map(([icon, label]) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: "2rem" }}>{icon}</div>
                  <span style={{ fontSize: "0.82rem", color: "var(--site-text-muted)", fontWeight: 600, textAlign: "center", maxWidth: 120 }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Contact CTA ───────────────────────────────────── */}
      <section className="site-section">
        <div className="site-container">
          <div style={{ textAlign: "center" }}>
            <h2 className="site-heading site-heading--sm" style={{ marginBottom: 16 }}>
              Any questions?
            </h2>
            <p className="site-lead" style={{ margin: "0 auto 32px" }}>
              Our team is happy to help with any questions about tickets, accreditation, volunteering or partnerships.
            </p>
            <a
              href="mailto:contact@luxembourg-indoor-meeting.lu"
              className="site-btn site-btn--primary"
            >
              Contact the organisation
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
