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
  if (roles.includes("gestionnaire")) return "/app/benevoles";
  if (roles.includes("gestionnaire_site")) return "/app/website";
  if (roles.includes("chef_equipe")) return "/app/equipe";
  if (roles.includes("benevole")) return "/app/mes-affectations";
  if (roles.includes("parent_u14")) return "/app/mes-enfants";
  return "/app";
}

function buildNavigationFromRoles(roles) {
  const isAdminNavigation = roles.includes("admin");

  if (isAdminNavigation) {
    const moduleLinks = [];

    if (roles.includes("chef_equipe")) {
      moduleLinks.push(
        makeLink("/app/equipe", "Mon equipe", "users"),
        makeLink("/app/presences", "Presences", "check"),
      );
    }

    if (roles.includes("benevole")) {
      moduleLinks.push(
        makeLink("/app/mon-dossier-benevole", "Mon dossier benevole", "badge"),
        makeLink("/app/mes-affectations", "Mes affectations", "pin"),
        makeLink("/app/mes-documents", "Mes documents", "folder"),
      );
    }

    if (roles.includes("parent_u14")) {
      moduleLinks.push(makeLink("/app/mes-enfants", "Mes enfants", "child"));
    }

    return [
      makeSection("Pilotage", [makeLink("/app", "Tableau de bord", "dashboard")]),
      makeSection("Gestion", [
        makeLink("/app/benevoles", "Benevoles", "users"),
        makeLink("/app/postes", "Equipes et postes", "grid"),
        makeLink("/app/presences", "Presences", "check"),
        makeLink("/app/u14", "Pre-programme U14", "spark"),
        makeLink("/app/presse", "Presse", "badge"),
      ]),
      makeSection("Contenus", [
        makeLink("/app/documents", "Documents", "folder"),
        makeLink("/app/accreditations", "Accreditations", "ticket"),
        makeLink("/app/vip", "VIP", "ticket"),
      ]),
      makeSection("Site web", [
        makeLink("/app/website", "Vue d'ensemble site", "grid"),
        makeLink("/app/website/edition", "Edition courante", "calendar"),
        makeLink("/app/website/news", "Actualites", "spark"),
        makeLink("/app/website/sponsors", "Partenaires", "badge"),
        makeLink("/app/website/press", "Communiques presse", "folder"),
      ]),
      ...(moduleLinks.length ? [makeSection("Modules", moduleLinks)] : []),
      makeSection("Parametres", [
        makeLink("/app/roles", "Roles plateforme", "shield"),
        makeLink("/app/invitations", "Invitations", "spark"),
        makeLink("/app/profil", "Mon profil", "profile"),
      ]),
    ];
  }

  const links = [makeLink("/app", "Vue d'ensemble", "dashboard")];

  if (roles.includes("gestionnaire") && !roles.includes("admin")) {
    links.push(
      makeLink("/app/benevoles", "Gestion des bénévoles", "users"),
      makeLink("/app/u14", "Pré-programme", "spark"),
      makeLink("/app/presences", "Présences", "check"),
      makeLink("/app/documents", "Documents", "folder"),
      makeLink("/app/accreditations", "Accreditations", "ticket"),
      makeLink("/app/vip", "VIP", "ticket"),
      makeLink("/app/presse", "Presse", "badge"),
    );
  }

  if (roles.includes("chef_equipe")) {
    links.push(
      makeLink("/app/equipe", "Mon equipe", "users"),
      makeLink("/app/presences", "Presences", "check"),
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
      makeLink("/app/website/news", "Actualités", "spark"),
      makeLink("/app/website/sponsors", "Partenaires", "badge"),
      makeLink("/app/website/press", "Communiqués presse", "folder"),
    );
  }

  if (roles.includes("parent_u14")) {
    links.push(makeLink("/app/mes-enfants", "Mes enfants", "child"));
  }

  links.push(makeLink("/app/profil", "Mon profil", "profile"));

  return links;
}

function buildAthletePortalNavigation(roles, portalSettings, { canImport }) {
  const isAdmin = roles.includes("admin") || roles.includes("meeting_director");
  const links = [
    makeLink("/app/athlete-portal", "Overview", "dashboard"),
    makeLink("/app/athlete-portal/athletes", "Athletes", "users"),
  ];

  if (canImport) {
    links.push(makeLink("/app/athlete-portal/import", "Import", "spark"));
  }

  if (isAdmin) {
    links.push(makeLink("/app/athlete-portal/registry", "Athletes database", "users"));
    links.push(makeLink("/app/athlete-portal/history", "Meeting results", "calendar"));
    links.push(makeLink("/app/athlete-portal/records", "Meeting records", "star"));
    links.push(makeLink("/app/athlete-portal/winners", "Hall of winners", "trophy"));
  }

  if (roles.includes("admin")) {
    links.push(makeLink("/app/athlete-portal/settings", "Portal settings", "shield"));
  }

  return links;
}

export {
  buildNavigation,
  buildNavigationFromRoles,
  buildAthletePortalNavigation,
  getActiveRoles,
  getDefaultRouteByRoles,
  getPrimaryRole,
};
