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

  if (isAdminNavigation) {
    const moduleLinks = [];

    if (roles.includes("chef_equipe")) {
      moduleLinks.push(
        makeLink("/app/equipe", "Mon équipe", "users"),
        makeLink("/app/presences", "Présences", "check"),
      );
    }

    if (roles.includes("benevole")) {
      moduleLinks.push(
        makeLink("/app/mon-dossier-benevole", "Mon dossier bénévole", "badge"),
        makeLink("/app/mes-affectations", "Mes affectations", "pin"),
        makeLink("/app/mes-documents", "Mes documents", "folder"),
      );
    }

    if (roles.includes("parent_u14")) {
      moduleLinks.push(makeLink("/app/mes-enfants", "Mes enfants", "child"));
    }

    return [
      makeSection("Vue générale", [makeLink("/app", "Tableau de bord", "dashboard")]),
      makeSection("Opérations", [
        makeLink("/app/benevoles", "Bénévoles", "users"),
        makeLink("/app/postes", "Équipes & postes", "grid"),
        makeLink("/app/presences", "Présences", "check"),
        makeLink("/app/u14", "Pré-programme U14", "spark"),
        makeLink("/app/presse", "Presse", "badge"),
        makeLink("/app/budget", "Budget", "dashboard"),
      ]),
      makeSection("Ressources", [
        makeLink("/app/documents", "Documents", "folder"),
        makeLink("/app/accreditations", "Accréditations", "ticket"),
        makeLink("/app/vip", "VIP", "ticket"),
      ]),
      makeSection("Site web", [
        makeLink("/app/website", "Vue d’ensemble", "grid"),
        makeLink("/app/website/edition", "Édition courante", "calendar"),
        makeLink("/app/website/news", "Actualités", "spark"),
        makeLink("/app/website/sponsors", "Partenaires", "badge"),
        makeLink("/app/website/press", "Communiqués presse", "folder"),
      ]),
      ...(moduleLinks.length ? [makeSection("Mes accès", moduleLinks)] : []),
      makeSection("Réglages", [
        makeLink("/app/roles", "Rôles & accès", "shield"),
        makeLink("/app/invitations", "Invitations", "spark"),
        makeLink("/app/profil", "Mon profil", "profile"),
      ]),
    ];
  }

  const links = [makeLink("/app", "Vue d'ensemble", "dashboard")];

  if (roles.includes("gestionnaire") && !roles.includes("admin")) {
    links.push(
      makeLink("/app/benevoles", "Gestion bénévoles", "users"),
      makeLink("/app/u14", "Pré-programme U14", "spark"),
      makeLink("/app/presences", "Présences", "check"),
      makeLink("/app/documents", "Documents", "folder"),
      makeLink("/app/accreditations", "Accréditations", "ticket"),
      makeLink("/app/vip", "VIP", "ticket"),
      makeLink("/app/presse", "Presse", "badge"),
    );
  }

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
  const links = [
    makeLink("/app/athlete-portal", "Vue d’ensemble", "dashboard"),
    makeLink("/app/athlete-portal/athletes", "Athlètes", "users"),
  ];

  if (canImport) {
    links.push(makeLink("/app/athlete-portal/import", "Import", "spark"));
  }

  if (isAdmin) {
    links.push(makeLink("/app/athlete-portal/registry", "Base athlètes", "users"));
    links.push(makeLink("/app/athlete-portal/history", "Résultats meeting", "calendar"));
    links.push(makeLink("/app/athlete-portal/records", "Records meeting", "star"));
    links.push(makeLink("/app/athlete-portal/winners", "Hall of Winners", "trophy"));
  }

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

export {
  buildNavigation,
  buildNavigationFromRoles,
  buildAthletePortalNavigation,
  getActiveRoles,
  getDefaultRouteByRoles,
  getPrimaryRole,
};
