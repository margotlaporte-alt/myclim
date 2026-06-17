export const DEFAULT_SPONSOR_MEDIA_SETTINGS = {
  logoFit: "contain",
  logoPositionX: 50,
  logoPositionY: 50,
  logoScale: 100,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeNumber(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function getSponsorMediaSettings(sponsor = {}) {
  const fit = sponsor.logoFit === "cover" ? "cover" : DEFAULT_SPONSOR_MEDIA_SETTINGS.logoFit;
  const positionX = clamp(normalizeNumber(sponsor.logoPositionX, DEFAULT_SPONSOR_MEDIA_SETTINGS.logoPositionX), 0, 100);
  const positionY = clamp(normalizeNumber(sponsor.logoPositionY, DEFAULT_SPONSOR_MEDIA_SETTINGS.logoPositionY), 0, 100);
  const scale = clamp(normalizeNumber(sponsor.logoScale, DEFAULT_SPONSOR_MEDIA_SETTINGS.logoScale), 60, 200);

  return {
    logoFit: fit,
    logoPositionX: positionX,
    logoPositionY: positionY,
    logoScale: scale,
  };
}

export function getSponsorMediaStyle(sponsor = {}) {
  const { logoFit, logoPositionX, logoPositionY, logoScale } = getSponsorMediaSettings(sponsor);

  return {
    objectFit: logoFit,
    objectPosition: `${logoPositionX}% ${logoPositionY}%`,
    transform: `scale(${logoScale / 100})`,
    transformOrigin: `${logoPositionX}% ${logoPositionY}%`,
  };
}
