import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth-context";
import { getActiveRoles, getDefaultRouteByRoles } from "./navigation";

function RequireAuth() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="page">
        <section className="page-header">
          <div>
            <p className="eyebrow">Chargement</p>
            <h1>Ouverture de MyCLIM</h1>
            <p>Nous restaurons votre session et vos accès.</p>
          </div>
        </section>
      </div>
    );
  }
  return currentUser ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;
}

function RequireRouteAccess({ allowedRoles }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);

  if (!allowedRoles?.length || allowedRoles.some((role) => roles.includes(role))) {
    return <Outlet />;
  }

  return (
    <Navigate
      replace
      to={getDefaultRouteByRoles(roles)}
      state={{
        accessDeniedMessage:
          "Vous n'avez pas les droits pour ouvrir cette page. Vous avez été redirigé vers un espace autorisé.",
      }}
    />
  );
}

export { RequireAuth, RequireRouteAccess };
