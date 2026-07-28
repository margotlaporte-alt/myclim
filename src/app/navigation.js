import { extractRolesFromProfile } from "./utils";

function makeSection(title, links) {
  return { type: "section", title, links };
}

function makeLink(to, label, icon) {
  return { to, label, icon };
}

function getActiveRoles(profile) {
  const roles = extractRolesFromProfile(profile);
  return roles.length ? roles : ["benevole"];
}

function getPrimaryRole(profile) {
  const roles = getActiveRoles(profile);

  if (roles.includes("admin")) return "admin";
  if (roles.includes("budget")) return "budget";
  if (roles.includes("gestionnaire")) return "gestionnaire";
  if (roles.includes("chef_equipe")) return "chef_equipe";
  if (roles.includes("parent_u14")) return "parent_u14";
  return "benevole";
}

function buildNavigation(profile) {
  return buildNavigationFromRoles(getActiveRoles(profile));
}

function getDefaultRouteByRoles(roles = []) {
  if (roles.includes("admin")) return "/app";
  if (roles.includes("budget")) return "/app/budget";
  if (roles.includes("gestionnaire")) return "/app/benevoles";
  if (roles.includes("gestionnaire_site")) return "/app/website";
  if (roles.includes("chef_equipe")) return "/app/equipe";
  if (roles.includes("chef_transport_athletes")) return "/app/athlete-portal/transport";
  if (roles.includes("benevole_transport_athletes")) return "/app/athlete-portal/mes-transport";
  if (roles.includes("benevole")) return "/app/mes-affectations";
  if (roles.includes("parent_u14")) return "/app/mes-enfants";
  return "/app";
}

function buildNavigationFromRoles(roles) {
  const isAdminNavigation = roles.includes("admin");
  const preProgrammeLinks = [
    makeLink("/app/u14", "U12 / U14", "spark"),
    makeLink("/app/u14/porte-panier", "Porte-panier", "child"),
  ];

  if (isAdminNavigation) {
    return [
      makeSection("Vue générale", [
        makeLink("/app", "Tableau de bord", "dashboard"),
        makeLink("/app/documents", "Documents", "folder"),
        makeLink("/app/budget", "Budget", "dashboard"),
      ]),
      makeSection("Bénévoles", [
        makeLink("/app/benevoles", "Bénévoles", "users"),
        makeLink("/app/postes", "Équipes & postes", "grid"),
        makeLink("/app/presences", "Présences", "check"),
      ]),
      makeSection("Accréditations", [
        makeLink("/app/accreditations/benevoles", "Bénévoles", "ticket"),
        makeLink("/app/accreditations/juges", "Juges", "badge"),
        makeLink("/app/presse", "Presse", "badge"),
        makeLink("/app/vip", "VIP", "ticket"),
      ]),
      makeSection("Pré-programme", preProgrammeLinks),
      makeSection("Site web", [
        makeLink("/app/website", "Vue d’ensemble", "grid"),
        makeLink("/app/website/edition", "Édition courante", "calendar"),
        makeLink("/app/website/emagazine", "E-magazine", "folder"),
        makeLink("/app/website/news", "Actualités", "spark"),
        makeLink("/app/website/sponsors", "Partenaires", "badge"),
        makeLink("/app/website/press", "Communiqués presse", "folder"),
      ]),
      makeSection("Réglages", [
        makeLink("/app/roles", "Rôles & accès", "shield"),
        makeLink("/app/invitations", "Invitations", "spark"),
        makeLink("/app/profil", "Mon profil", "profile"),
      ]),
    ];
  }

  if (roles.includes("gestionnaire")) {
    const personalLinks = [];

    if (roles.includes("chef_equipe")) {
      personalLinks.push(makeLink("/app/equipe", "Mon équipe", "users"));
    }

    if (roles.includes("benevole")) {
      personalLinks.push(
        makeLink("/app/mon-dossier-benevole", "Mon dossier bénévole", "badge"),
        makeLink("/app/mes-affectations", "Mes affectations", "pin"),
        makeLink("/app/mes-documents", "Mes documents", "folder"),
      );
    }

    if (roles.includes("parent_u14")) {
      personalLinks.push(makeLink("/app/mes-enfants", "Mes enfants", "child"));
    }

    const navigation = [
      makeSection("Vue générale", [
        makeLink("/app", "Vue d'ensemble", "dashboard"),
        makeLink("/app/documents", "Documents", "folder"),
        ...(roles.includes("budget") ? [makeLink("/app/budget", "Budget", "dashboard")] : []),
      ]),
      makeSection("Bénévoles", [
        makeLink("/app/benevoles", "Bénévoles", "users"),
        makeLink("/app/presences", "Présences", "check"),
      ]),
      makeSection("Accréditations", [
        makeLink("/app/accreditations/benevoles", "Bénévoles", "ticket"),
        makeLink("/app/accreditations/juges", "Juges", "badge"),
        makeLink("/app/presse", "Presse", "badge"),
        makeLink("/app/vip", "VIP", "ticket"),
      ]),
      makeSection("Pré-programme", preProgrammeLinks),
    ];

    if (roles.includes("gestionnaire_site")) {
      navigation.push(
        makeSection("Site web", [
          makeLink("/app/website", "Site web — vue d'ensemble", "grid"),
          makeLink("/app/website/edition", "Édition courante", "calendar"),
          makeLink("/app/website/emagazine", "E-magazine", "folder"),
          makeLink("/app/website/news", "Actualités", "spark"),
          makeLink("/app/website/sponsors", "Partenaires", "badge"),
          makeLink("/app/website/press", "Communiqués presse", "folder"),
        ]),
      );
    }

    if (personalLinks.length) {
      navigation.push(makeSection("Mes accès", personalLinks));
    }

    navigation.push(makeSection("Réglages", [makeLink("/app/profil", "Mon profil", "profile")]));

    return navigation;
  }

  const links = [makeLink("/app", "Vue d'ensemble", "dashboard")];

  if (roles.includes("budget")) {
    links.push(makeLink("/app/budget", "Budget", "dashboard"));
  }

  if (roles.includes("chef_equipe")) {
    links.push(
      makeLink("/app/equipe", "Mon équipe", "users"),
      makeLink("/app/presences", "Présences", "check"),
    );
  }

  if (roles.includes("benevole")) {
    links.push(
      makeLink("/app/mon-dossier-benevole", "Mon dossier bénévole", "badge"),
      makeLink("/app/mes-affectations", "Mes affectations", "pin"),
      makeLink("/app/mes-documents", "Mes documents", "folder"),
    );
  }

  if (roles.includes("gestionnaire_site")) {
    links.push(
      makeLink("/app/website", "Site web — vue d'ensemble", "grid"),
      makeLink("/app/website/edition", "Édition courante", "calendar"),
      makeLink("/app/website/emagazine", "E-magazine", "folder"),
      makeLink("/app/website/news", "Actualités", "spark"),
      makeLink("/app/website/sponsors", "Partenaires", "badge"),
      makeLink("/app/website/press", "Communiqués presse", "folder"),
    );
  }

  if (roles.includes("parent_u14")) {
    links.push(makeLink("/app/mes-enfants", "Mes enfants", "child"));
  }

  if (roles.includes("chef_transport_athletes")) {
    links.push(makeLink("/app/athlete-portal/transport", "Transport athlètes", "users"));
  }

  if (roles.includes("benevole_transport_athletes")) {
    links.push(makeLink("/app/athlete-portal/mes-transport", "Mes transports", "pin"));
  }

  links.push(makeLink("/app/profil", "Mon profil", "profile"));

  return links;
}

function buildAthletePortalNavigation(roles, portalSettings, { canImport }) {
  const isAdmin = roles.includes("admin") || roles.includes("meeting_director");
  const links = [makeLink("/app/athlete-portal/athletes", "Athlètes", "users")];

  if (roles.includes("chef_transport_athletes") || roles.includes("admin")) {
    links.push(makeLink("/app/athlete-portal/transport", "Transport athlètes", "users"));
  }

  if (roles.includes("benevole_transport_athletes")) {
    links.push(makeLink("/app/athlete-portal/mes-transport", "Mes transports", "pin"));
  }

  if (roles.includes("admin")) {
    links.push(makeLink("/app/athlete-portal/settings", "Réglages portal", "shield"));
  }

  return links;
}

function buildStatisticsNavigation(roles) {
  const isAdmin = roles.includes("admin") || roles.includes("meeting_director");
  if (!isAdmin) return [];

  return [
    makeLink("/app/statistics/registry", "Base athlètes", "users"),
    makeLink("/app/statistics/results", "Résultats meeting", "calendar"),
    makeLink("/app/statistics/records", "Records meeting", "star"),
    makeLink("/app/statistics/winners", "Hall of Winners", "trophy"),
  ];
}

export {
  buildNavigation,
  buildNavigationFromRoles,
  buildAthletePortalNavigation,
  buildStatisticsNavigation,
  getActiveRoles,
  getDefaultRouteByRoles,
  getPrimaryRole,
};
