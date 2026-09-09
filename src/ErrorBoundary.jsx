import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[MyCLIM] Unhandled UI error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px",
            fontFamily: "Arial, sans-serif",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: "22px", marginBottom: "12px" }}>Un problème est survenu</h1>
            <p style={{ color: "#5d6b82", marginBottom: "24px" }}>
              MyCLIM a rencontré une erreur inattendue. Recharge la page pour réessayer ; si le problème persiste,
              contacte l'équipe technique.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: "#e30d25",
                color: "#fff",
                border: "none",
                borderRadius: "999px",
                padding: "12px 28px",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
