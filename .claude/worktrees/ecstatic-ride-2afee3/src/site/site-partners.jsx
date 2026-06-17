import { useSponsors } from "./site-hooks";

const CATEGORY_ORDER = ["title", "main", "institutional", "media", "supplier"];
const CATEGORY_LABELS = {
  title: "Title Partner",
  main: "Main Partners",
  institutional: "Institutional Partners",
  media: "Media Partners",
  supplier: "Suppliers & Partners",
};
const CATEGORY_DESCRIPTIONS = {
  title: "The CMCM Luxembourg Indoor Meeting is named after its title partner, whose support is foundational to the event's existence and development.",
  main: "Our main partners provide essential support across operations, logistics and athlete services, making the meeting possible at the highest level.",
  institutional: "Public institutions and federations whose backing gives the event its legitimacy and enables its long-term ambitions.",
  media: "Media partners who broadcast and cover the meeting, amplifying its reach to fans across Luxembourg and beyond.",
  supplier: "Specialist suppliers and technical partners who bring expertise and equipment essential to a world-class athletics event.",
};

function PartnerCard({ sponsor }) {
  const content = (
    <div
      style={{
        background: "var(--site-card)",
        border: "1px solid var(--site-border)",
        borderRadius: "var(--site-radius)",
        padding: "24px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        transition: "transform 0.22s, box-shadow 0.22s, border-color 0.22s",
        cursor: sponsor.website ? "pointer" : "default",
        textDecoration: "none",
      }}
      className="site-card"
    >
      {sponsor.logoUrl ? (
        <div style={{ height: 60, display: "flex", alignItems: "center" }}>
          <img
            src={sponsor.logoUrl}
            alt={sponsor.name}
            style={{
              maxHeight: "100%",
              maxWidth: 180,
              objectFit: "contain",
            }}
          />
        </div>
      ) : (
        <div style={{
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.1rem",
          fontWeight: 800,
          color: "var(--site-text-muted)",
          letterSpacing: "0.04em",
        }}>
          {sponsor.name}
        </div>
      )}
      {sponsor.description && (
        <p style={{ fontSize: "0.8rem", color: "var(--site-text-muted)", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
          {sponsor.description}
        </p>
      )}
    </div>
  );

  if (sponsor.website) {
    return (
      <a href={sponsor.website} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
        {content}
      </a>
    );
  }
  return content;
}

function FeaturedPartner({ sponsor }) {
  const wrapper = (
    <div className="site-partner-featured">
      <div className="site-partner-featured__logo">
        {sponsor.logoUrl ? (
          <img src={sponsor.logoUrl} alt={sponsor.name} />
        ) : (
          <span style={{ fontSize: "2rem", fontWeight: 900, color: "var(--site-text-muted)" }}>{sponsor.name}</span>
        )}
      </div>
      <div className="site-partner-featured__body">
        <span className="site-eyebrow">Title partner</span>
        <h2>{sponsor.name}</h2>
        <p>
          {sponsor.description || "As the title partner of the CMCM Luxembourg Indoor Meeting, their support is at the heart of everything we do — from athlete recruitment to fan experience."}
        </p>
        {sponsor.website && (
          <a
            href={sponsor.website}
            target="_blank"
            rel="noopener noreferrer"
            className="site-btn site-btn--secondary site-btn--sm"
            style={{ marginTop: 20, display: "inline-flex" }}
          >
            Visit website →
          </a>
        )}
      </div>
    </div>
  );
  return wrapper;
}

export function SitePartners() {
  const { sponsors, loading } = useSponsors(true);

  const byCategory = sponsors.reduce((acc, s) => {
    const cat = s.category || "supplier";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  const titlePartner = byCategory.title?.[0] || null;

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="site-partners-hero">
        <div className="site-container">
          <span className="site-eyebrow">Supporting the meeting</span>
          <h1 className="site-heading">Our Partners</h1>
          <p className="site-lead">
            The CMCM Luxembourg Indoor Meeting is made possible by the trust, commitment and generosity of our partners — from title sponsor to technical suppliers.
          </p>
          <a
            href="mailto:communication@fla.lu"
            className="site-btn site-btn--primary"
          >
            Become a partner
          </a>
        </div>
      </section>

      {/* ── Partners content ─────────────────────────────── */}
      <section className="site-section">
        <div className="site-container">
          {loading ? (
            <div style={{ textAlign: "center", color: "var(--site-text-muted)", padding: "64px 0" }}>
              Loading partners…
            </div>
          ) : sponsors.length === 0 ? (
            /* Default view when no sponsors configured */
            <>
              <div style={{
                textAlign: "center",
                padding: "80px 0",
                color: "var(--site-text-muted)",
              }}>
                <div style={{ fontSize: "3rem", marginBottom: 16 }}>🤝</div>
                <h2 style={{ color: "var(--site-text)", marginBottom: 12 }}>Partner information coming soon</h2>
                <p style={{ maxWidth: 480, margin: "0 auto 32px" }}>
                  Our partner page is being set up. Please contact us for partnership enquiries.
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                  <a href="mailto:communication@fla.lu" className="site-btn site-btn--primary">
                    Become a partner
                  </a>
                </div>
              </div>

              {/* Default placeholder partners */}
              <div style={{ borderTop: "1px solid var(--site-border)", paddingTop: 64 }}>
                {[
                  { key: "title", names: ["CMCM"] },
                  { key: "institutional", names: ["Gouvernement du Luxembourg", "Ville de Luxembourg", "Coque", "FLA"] },
                  { key: "media", names: ["RTL", "Luxemburger Wort", "L'Essentiel"] },
                ].map(({ key, names }) => (
                  <div key={key} style={{ marginBottom: 48, textAlign: "center" }}>
                    <p style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--site-text-dim)", marginBottom: 24 }}>
                      {CATEGORY_LABELS[key]}
                    </p>
                    <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
                      {names.map((name) => (
                        <div
                          key={name}
                          style={{
                            padding: "20px 32px",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid var(--site-border)",
                            borderRadius: "var(--site-radius-sm)",
                            fontWeight: 800,
                            fontSize: key === "title" ? "1.4rem" : "1rem",
                            color: "var(--site-text-muted)",
                          }}
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Title partner — featured */}
              {titlePartner && <FeaturedPartner sponsor={titlePartner} />}

              {/* Other categories */}
              {CATEGORY_ORDER.filter((cat) => cat !== "title" && byCategory[cat]?.length).map((cat) => (
                <div key={cat} style={{ marginBottom: 64 }}>
                  <div style={{ textAlign: "center", marginBottom: 32 }}>
                    <p style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--site-red)", marginBottom: 8 }}>
                      {CATEGORY_LABELS[cat]}
                    </p>
                    {CATEGORY_DESCRIPTIONS[cat] && (
                      <p style={{ fontSize: "0.9rem", color: "var(--site-text-muted)", maxWidth: 560, margin: "0 auto", lineHeight: 1.65 }}>
                        {CATEGORY_DESCRIPTIONS[cat]}
                      </p>
                    )}
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(auto-fill, minmax(${cat === "main" ? 240 : 180}px, 1fr))`,
                    gap: 16,
                  }}>
                    {byCategory[cat].map((s) => (
                      <PartnerCard key={s.id} sponsor={s} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      {/* ── Become a partner CTA ─────────────────────────── */}
      <section className="site-section site-section--alt">
        <div className="site-container" style={{ textAlign: "center" }}>
          <span className="site-eyebrow">Join us</span>
          <h2 className="site-heading site-heading--sm" style={{ marginBottom: 16 }}>
            Become a partner
          </h2>
          <p className="site-lead" style={{ margin: "0 auto 40px" }}>
            Associating your brand with the CMCM Luxembourg Indoor Meeting means visibility in front of thousands of spectators, international media coverage and a premium event environment.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, maxWidth: 800, margin: "0 auto 48px", textAlign: "left" }}>
            {[
              ["📺", "International visibility", "Reach a global athletics audience through our broadcast and media coverage."],
              ["🏟️", "Premium positioning", "Your brand alongside World Athletics Indoor Tour Silver events."],
              ["🤝", "Tailor-made packages", "Flexible partnership structures adapted to your objectives and budget."],
            ].map(([icon, title, desc]) => (
              <div
                key={title}
                style={{
                  background: "var(--site-card)",
                  border: "1px solid var(--site-border)",
                  borderRadius: "var(--site-radius)",
                  padding: 24,
                }}
              >
                <div style={{ fontSize: "1.8rem", marginBottom: 12 }}>{icon}</div>
                <h3 style={{ fontSize: "0.925rem", fontWeight: 700, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: "0.82rem", lineHeight: 1.65 }}>{desc}</p>
              </div>
            ))}
          </div>
          <a
            href="mailto:communication@fla.lu"
            className="site-btn site-btn--primary"
          >
            Contact us about partnerships
          </a>
        </div>
      </section>
    </>
  );
}
