import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const WIDTH = 1240;
const HEIGHT = 1748;

const root = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(root, "assets");
const outputDir = path.join(root, "generated");

fs.mkdirSync(outputDir, { recursive: true });

const asset = (file) => `file://${path.join(assetsDir, file)}`;

const sponsorLogos = {
  coque: asset("coque.png"),
  cmcm: asset("cmcm-partner.png"),
  europeanAthletics: asset("european-athletics.svg"),
  luxembourg: asset("luxembourg.png"),
  ville: asset("ville-luxembourg.png"),
  worldAthleticsSilver: asset("world-athletics-silver.png"),
};

const meetingLogos = {
  principal: asset("meeting-principal.png"),
  bleu: asset("meeting-bleu.png"),
  rouge: asset("meeting-rouge.png"),
  noir: asset("meeting-noir.png"),
};

const variants = [
  {
    key: "principal-all-zones",
    meetingLogo: meetingLogos.principal,
    accent: "#0897d1",
    accentSoft: "#dff4fb",
    roleBg: "#0d9ed8",
    roleText: "#ffffff",
    accessLabel: "TOUTES ZONES",
    accessTextColor: "#0d3a5a",
    accessBg: "#eef8fc",
    chips: [
      { label: "TRIBUNE", active: true, color: "#11a0d8" },
      { label: "MIXED ZONE", active: true, color: "#11a0d8" },
      { label: "INFIELD", active: true, color: "#11a0d8" },
    ],
  },
  {
    key: "bleu-infield-autorise",
    meetingLogo: meetingLogos.bleu,
    accent: "#119fd7",
    accentSoft: "#def3fb",
    roleBg: "#0f7fb0",
    roleText: "#ffffff",
    accessLabel: "INFIELD AUTORISE",
    accessTextColor: "#0d3a5a",
    accessBg: "#eef8fc",
    chips: [
      { label: "TRIBUNE", active: true, color: "#119fd7" },
      { label: "MIXED ZONE", active: true, color: "#119fd7" },
      { label: "INFIELD", active: true, color: "#119fd7" },
    ],
  },
  {
    key: "rouge-sans-infield",
    meetingLogo: meetingLogos.rouge,
    accent: "#ea1021",
    accentSoft: "#ffe8eb",
    roleBg: "#119fd7",
    roleText: "#ffffff",
    accessLabel: "INFIELD NON AUTORISE",
    accessTextColor: "#7c1320",
    accessBg: "#fff2f4",
    chips: [
      { label: "TRIBUNE", active: true, color: "#119fd7" },
      { label: "MIXED ZONE", active: true, color: "#119fd7" },
      { label: "INFIELD", active: false, color: "#ea1021" },
    ],
  },
  {
    key: "noir-aucune-zone",
    meetingLogo: meetingLogos.noir,
    accent: "#111111",
    accentSoft: "#f0f0f0",
    roleBg: "#2f2f2f",
    roleText: "#ffffff",
    accessLabel: "AUCUNE ZONE",
    accessTextColor: "#2f2f2f",
    accessBg: "#f4f4f4",
    chips: [
      { label: "TRIBUNE", active: false, color: "#555555" },
      { label: "MIXED ZONE", active: false, color: "#555555" },
      { label: "INFIELD", active: false, color: "#555555" },
    ],
  },
];

const badgeText = {
  category: "COMITE DIRECTEUR FLA",
  firstName: "ESPOSITO",
  lastName: "CARMELA",
};

function renderChips(chips) {
  return chips
    .map((chip, index) => {
      const x = 150 + index * 320;
      const y = 1210;
      const fill = chip.active ? chip.color : "#ffffff";
      const stroke = chip.active ? chip.color : "#c7d4de";
      const textFill = chip.active ? "#ffffff" : "#8194a4";
      return `
    <rect x="${x}" y="${y}" width="260" height="86" rx="26" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
    <text x="${x + 130}" y="${y + 54}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="${textFill}">${chip.label}</text>`;
    })
    .join("");
}

function renderSvg(variant) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bgFade" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="62%" stop-color="#f8fbfe"/>
      <stop offset="100%" stop-color="#eef5fb"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#6ba9c4" flood-opacity="0.18"/>
    </filter>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgFade)"/>
  <circle cx="1110" cy="250" r="320" fill="${variant.accentSoft}"/>
  <circle cx="1020" cy="1510" r="350" fill="#e7f0f8"/>
  <path d="M260 250 C 760 340, 990 620, 980 1680" fill="none" stroke="#dfeaf4" stroke-width="180" stroke-linecap="round" opacity="0.9"/>
  <path d="M330 270 C 780 360, 980 650, 970 1680" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.9"/>
  <path d="M410 290 C 820 380, 1020 680, 1010 1680" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.9"/>
  <path d="M490 310 C 860 400, 1060 710, 1050 1680" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.9"/>
  <path d="M570 330 C 900 420, 1100 740, 1090 1680" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.9"/>

  <image href="${sponsorLogos.worldAthleticsSilver}" x="426" y="36" width="388" height="252" preserveAspectRatio="xMidYMid meet"/>
  <text x="620" y="314" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="600" letter-spacing="6" fill="#9db0bf">ACCREDITATION OFFICIELLE</text>

  <rect x="120" y="348" width="1000" height="315" rx="54" fill="#ffffff" filter="url(#softShadow)"/>
  <image href="${variant.meetingLogo}" x="150" y="388" width="940" height="235" preserveAspectRatio="xMidYMid meet"/>

  <rect x="80" y="730" width="1080" height="350" rx="42" fill="${variant.roleBg}" filter="url(#softShadow)"/>
  <text x="620" y="835" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="800" fill="${variant.roleText}">${badgeText.category}</text>
  <text x="620" y="923" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="63" font-weight="700" fill="${variant.roleText}">${badgeText.firstName}</text>
  <text x="620" y="1000" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="63" font-weight="700" fill="${variant.roleText}">${badgeText.lastName}</text>

  <text x="620" y="1140" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" letter-spacing="3" fill="${variant.accent}">ACCES AUTORISE</text>
  <rect x="120" y="1165" width="1000" height="190" rx="38" fill="${variant.accessBg}" stroke="${variant.accent}" stroke-width="4"/>
  <text x="620" y="1330" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="800" letter-spacing="2" fill="${variant.accessTextColor}">${variant.accessLabel}</text>

  ${renderChips(variant.chips)}

  <rect x="0" y="1490" width="${WIDTH}" height="258" fill="#ffffff" opacity="0.96"/>
  <line x1="90" y1="1510" x2="1150" y2="1510" stroke="#dfe6ee" stroke-width="4"/>
  <text x="620" y="1562" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" letter-spacing="4" fill="#8ca0b1">PARTENAIRES ET INSTITUTIONS</text>

  <image href="${sponsorLogos.coque}" x="90" y="1588" width="210" height="82" preserveAspectRatio="xMidYMid meet"/>
  <image href="${sponsorLogos.europeanAthletics}" x="312" y="1586" width="230" height="86" preserveAspectRatio="xMidYMid meet"/>
  <image href="${sponsorLogos.ville}" x="558" y="1582" width="205" height="94" preserveAspectRatio="xMidYMid meet"/>
  <image href="${sponsorLogos.cmcm}" x="760" y="1558" width="240" height="138" preserveAspectRatio="xMidYMid meet"/>
  <image href="${sponsorLogos.luxembourg}" x="1006" y="1596" width="160" height="64" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

for (const variant of variants) {
  const svg = renderSvg(variant);
  fs.writeFileSync(path.join(outputDir, `${variant.key}.svg`), svg, "utf8");
}

console.log(`Generated ${variants.length} accreditation templates in ${outputDir}`);
