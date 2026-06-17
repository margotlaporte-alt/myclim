import { NavLink } from "react-router-dom";
import volontaire1 from "../assets/site-gallery/volontaire-1.jpg";
import coque1 from "../assets/site-gallery/Coque2026.jpg";
import coque2 from "../assets/site-gallery/Coque2026-2.jpg";
import coque3 from "../assets/site-gallery/Coque2026-3.jpg";
import coque4 from "../assets/site-gallery/Coque2026-4.jpg";
import vip1 from "../assets/site-gallery/vip-1.jpg";
import vip2 from "../assets/site-gallery/vip-2.jpg";
import vip3 from "../assets/site-gallery/vip-3.jpg";
import vip4 from "../assets/site-gallery/vip-4.jpeg";
import vip5 from "../assets/site-gallery/vip-5.jpeg";
import vip6 from "../assets/site-gallery/vip-6.jpeg";

const TIMETABLE = [
  { time: "08:00", event: "Venue opens", detail: "Athlete check-in and warm-up area available" },
  { time: "09:00", event: "Field events start", detail: "High Jump, Long Jump, Shot Put, Pole Vault" },
  { time: "10:30", event: "Track events begin", detail: "60 m, 60 m Hurdles, 200 m heats" },
  { time: "12:00", event: "Doors open — public", detail: "Public access to Coque arena" },
  { time: "13:30", event: "Afternoon session", detail: "400 m, 800 m, 1500 m, Mile" },
  { time: "14:15", event: "VIP Tour", detail: "Exclusive backstage or venue tour (VIP ticket holders)" },
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

      {/* ── Venue photo strip ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", height: 280, overflow: "hidden" }}>
        {[coque1, coque2, coque3, coque4].map((src, i) => (
          <div key={i} style={{ overflow: "hidden" }}>
            <img
              src={src}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.4s ease" }}
              onMouseEnter={e => e.currentTarget.style.transform = "scale(1.04)"}
              onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
            />
          </div>
        ))}
      </div>

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
            eyebrow="Ticket sale"
            title="Tickets &amp; access"
            lead="Secure your place at the CMCM Luxembourg Indoor Meeting 2026. Tickets available from 17 November 2026 at 10:00 on ticket-regional.lu."
          />

          {/* Ticket tiers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginBottom: 40 }}>
            {/* Under 18 */}
            <div className="site-card" style={{ padding: 32 }}>
              <div style={{ width: 48, height: 4, background: "var(--site-blue)", borderRadius: 2, marginBottom: 24 }} />
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--site-text)", marginBottom: 6 }}>Under 18</h3>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: "var(--site-blue)", marginBottom: 12, lineHeight: 1 }}>
                Free
              </div>
              <p style={{ fontSize: "0.875rem", lineHeight: 1.65, color: "var(--site-text-muted)", marginBottom: 24 }}>
                Free entrance for all spectators under 18 years old.
              </p>
            </div>

            {/* Regular */}
            <div className="site-card" style={{ padding: 32 }}>
              <div style={{ width: 48, height: 4, background: "var(--site-red)", borderRadius: 2, marginBottom: 24 }} />
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--site-text)", marginBottom: 6 }}>Regular Ticket</h3>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: "2rem", fontWeight: 900, color: "var(--site-red)", lineHeight: 1 }}>€12</div>
                <div style={{
                  background: "rgba(232,0,28,0.1)",
                  color: "var(--site-red)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 20,
                }}>
                  Early-bird €8 until Dec 15
                </div>
              </div>
              <p style={{ fontSize: "0.875rem", lineHeight: 1.65, color: "var(--site-text-muted)", marginBottom: 24 }}>
                Enjoy an electrifying live experience from the stands, with access to both the pre-program and the main program.
              </p>
              <a
                href="https://www.ticket-regional.lu/"
                target="_blank"
                rel="noopener noreferrer"
                className="site-btn site-btn--secondary site-btn--sm"
              >
                Buy ticket →
              </a>
            </div>

            {/* VIP */}
            <div
              className="site-card"
              style={{
                padding: 32,
                background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div style={{ width: 48, height: 4, background: "#c9a227", borderRadius: 2, marginBottom: 24 }} />
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: 6 }}>VIP Ticket</h3>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: "2rem", fontWeight: 900, color: "#c9a227", lineHeight: 1 }}>€75</div>
                <div style={{
                  background: "rgba(201,162,39,0.2)",
                  color: "#c9a227",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 20,
                }}>
                  Early-bird €50 until Dec 15
                </div>
              </div>
              <p style={{ fontSize: "0.875rem", lineHeight: 1.65, color: "rgba(255,255,255,0.65)", marginBottom: 24 }}>
                Experience the event in a premium setting, including catering and a VIP tour of the venue. Tickets are limited.
              </p>
              <a
                href="https://www.ticket-regional.lu/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#c9a227",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  padding: "10px 20px",
                  borderRadius: "var(--site-radius-sm)",
                  textDecoration: "none",
                }}
              >
                Buy VIP ticket →
              </a>
            </div>
          </div>

          {/* What's included */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div style={{
              padding: "28px 32px",
              background: "var(--site-card)",
              border: "1px solid var(--site-border)",
              borderRadius: "var(--site-radius)",
            }}>
              <h4 style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--site-text-muted)", marginBottom: 16 }}>
                Regular Ticket — What's included
              </h4>
              {[
                "Access to the stands for the full day",
                "Pre-program and main competition",
                "Live athletics atmosphere",
              ].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                  <span style={{ color: "var(--site-red)", fontWeight: 700, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: "0.875rem", color: "var(--site-text-muted)", lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>

            <div style={{
              padding: "28px 32px",
              background: "linear-gradient(135deg, rgba(26,26,46,0.05), rgba(201,162,39,0.06))",
              border: "1px solid rgba(201,162,39,0.3)",
              borderRadius: "var(--site-radius)",
            }}>
              <h4 style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#b08c1e", marginBottom: 16 }}>
                VIP Ticket — What's included
              </h4>
              {[
                "Unlimited high-quality food and drinks throughout the event",
                "Premium seating in the VIP area",
                "Exclusive 30-minute VIP tour of the venue (starting 14:15)",
                "Choice between backstage tour or guided Coque visit",
              ].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                  <span style={{ color: "#c9a227", fontWeight: 700, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: "0.875rem", color: "var(--site-text-muted)", lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            marginTop: 32,
            padding: "20px 28px",
            background: "rgba(16,102,204,0.06)",
            border: "1px solid rgba(16,102,204,0.2)",
            borderRadius: "var(--site-radius-sm)",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}>
            <span style={{ fontSize: "0.875rem", color: "var(--site-text-muted)", flex: 1 }}>
              Tickets available from <strong style={{ color: "var(--site-text)" }}>17 November 2026 at 10:00</strong> on ticket-regional.lu
            </span>
            <a
              href="https://www.ticket-regional.lu/"
              target="_blank"
              rel="noopener noreferrer"
              className="site-btn site-btn--primary site-btn--sm"
            >
              Access ticketing →
            </a>
          </div>
        </div>
      </section>

      {/* ── VIP Experience ────────────────────────────────── */}
      <section className="site-section site-section--alt" id="vip">
        <div className="site-container">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
                <span className="site-eyebrow" style={{ color: "#b08c1e", margin: 0 }}>VIP visits available!</span>
                <span style={{
                  background: "#1a1a2e",
                  color: "#c9a227",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "3px 10px",
                  borderRadius: 20,
                  border: "1px solid rgba(201,162,39,0.4)",
                }}>
                  VIP ticket required
                </span>
              </div>
              <h2 className="site-heading site-heading--sm">Discover the Meeting Like Never Before</h2>
              <p style={{ color: "var(--site-text-muted)", lineHeight: 1.75, marginBottom: 24 }}>
                Join our exclusive VIP Tour and step behind the scenes of the CMCM Luxembourg Indoor Meeting 2026. Experience the excitement from a whole new perspective — walk through the athletes' warm-up area, feel the energy trackside, and explore the heart of the event.
              </p>

              <div style={{ marginBottom: 28 }}>
                <h4 style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--site-text-muted)", marginBottom: 16 }}>
                  Choose your tour
                </h4>
                {[
                  { icon: "🎽", title: "Backstage tour", desc: "See where the action really happens — athlete warm-up areas, mixed zone, and behind the scenes." },
                  { icon: "🏛️", title: "La Coque guided visit", desc: "Discover Luxembourg's iconic sports complex, home to world-class facilities and innovation in sport." },
                ].map(({ icon, title, desc }) => (
                  <div
                    key={title}
                    style={{
                      display: "flex",
                      gap: 16,
                      marginBottom: 16,
                      padding: "16px 20px",
                      background: "var(--site-card)",
                      border: "1px solid var(--site-border)",
                      borderRadius: "var(--site-radius-sm)",
                    }}
                  >
                    <span style={{ fontSize: "1.5rem", flexShrink: 0, marginTop: 2 }}>{icon}</span>
                    <div>
                      <strong style={{ fontSize: "0.9rem", display: "block", marginBottom: 4, color: "var(--site-text)" }}>{title}</strong>
                      <span style={{ fontSize: "0.82rem", color: "var(--site-text-muted)", lineHeight: 1.5 }}>{desc}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                padding: "16px 20px",
                background: "rgba(201,162,39,0.1)",
                border: "1px solid rgba(201,162,39,0.3)",
                borderRadius: "var(--site-radius-sm)",
                marginBottom: 24,
              }}>
                <p style={{ fontSize: "0.875rem", color: "var(--site-text-muted)", margin: 0, lineHeight: 1.6 }}>
                  Exclusively reserved for <strong style={{ color: "#c9a227" }}>VIP ticket holders</strong>. <strong style={{ color: "var(--site-text)" }}>Both tours start at 14:15</strong> in the VIP area and last approximately 30 minutes. Participation is optional. <strong style={{ color: "var(--site-text)" }}>Places are limited</strong> — don't miss your chance!
                </p>
              </div>

              <a
                href="mailto:communication@fla.lu"
                className="site-btn site-btn--primary site-btn--sm"
              >
                Contact us for more info →
              </a>
            </div>

            {/* VIP photo grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[vip1, vip2, vip3, vip4, vip5, vip6].map((src, i) => (
                <div
                  key={i}
                  style={{
                    overflow: "hidden",
                    borderRadius: "var(--site-radius-sm)",
                    aspectRatio: "1",
                    gridColumn: i === 0 ? "1 / 3" : "auto",
                    gridRow: i === 0 ? "1 / 2" : "auto",
                  }}
                >
                  <img
                    src={src}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.4s ease" }}
                    onMouseEnter={e => e.currentTarget.style.transform = "scale(1.06)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Livestream ────────────────────────────────────── */}
      <section className="site-section" id="livestream">
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
      <section className="site-section site-section--alt" id="volunteer">
        <div className="site-container">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
            <div style={{
              borderRadius: "var(--site-radius-lg)",
              overflow: "hidden",
              aspectRatio: "4/3",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            }}>
              <img
                src={volontaire1}
                alt="CMCM Luxembourg Indoor Meeting volunteers"
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 25%" }}
              />
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
      <section className="site-section">
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
      <section className="site-section site-section--alt">
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
