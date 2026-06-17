import { createContext, useContext } from "react";

const AuthContext = createContext(null);

function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

export { AuthContext, useAuth };
