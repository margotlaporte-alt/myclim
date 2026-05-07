import { createContext, useContext } from "react";

const LanguageContext = createContext(null);

function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  return context;
}

export { LanguageContext, useLanguage };
