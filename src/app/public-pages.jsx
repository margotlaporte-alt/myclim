import { NavLink } from "react-router-dom";
import cmcmLogo from "../assets/cmcm-logo.png";
import { LanguageSwitch } from "./language";
import { useLanguage } from "./language-context";

function PublicHomePage({ publicPaths }) {
  const { t } = useLanguage();

  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-topbar">
          <div className="landing-topline">{t("landingTopline")}</div>
          <div className="landing-topbar-actions">
            <NavLink className="landing-login-link" to="/login">
              {t("landingLoginButton")}
            </NavLink>
            <LanguageSwitch />
          </div>
        </div>
        <div className="landing-brand">
          <div className="landing-logo-shell">
            <img alt="Logo CMCM Luxembourg Indoor Meeting" className="landing-logo" src={cmcmLogo} />
          </div>
          <div className="landing-copy">
            <h1>{t("landingTitle")}</h1>
            <p>{t("landingDescription")}</p>
            <div className="landing-actions">
              <NavLink className="landing-login-button" to="/login">
                {t("landingLoginButton")}
              </NavLink>
              <span className="landing-login-hint">{t("landingLoginHint")}</span>
            </div>
          </div>
        </div>
        <div className="landing-links">
          {publicPaths.map((item) => (
            <NavLink key={item.to} className="landing-link-card" to={item.to}>
              <div className="landing-link-media">
                <img alt={t(item.titleKey)} src={item.image} />
              </div>
              <strong>{t(item.titleKey)}</strong>
              <span>{t(item.descriptionKey)}</span>
            </NavLink>
          ))}
        </div>
      </section>
    </div>
  );
}

export { PublicHomePage };
