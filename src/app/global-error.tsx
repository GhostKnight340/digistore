"use client";

import { useEffect } from "react";

/**
 * Root boundary: catches failures in the root layout itself. Because the
 * layout (and therefore globals.css) may be exactly what failed, this file
 * renders its own document and uses inline styles only — no imports, no
 * design-token classes, no shared components.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/global-error]", {
      digest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: "#0b0d12",
          color: "#e6e8ee",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: "480px", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#3e7bfa",
            }}
          >
            Erreur
          </p>
          <h1
            style={{
              margin: "12px 0 0",
              fontSize: "24px",
              fontWeight: 700,
              color: "#fff",
            }}
          >
            Le site est momentanément indisponible
          </h1>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: "14px",
              lineHeight: 1.6,
              color: "#9aa3b2",
            }}
          >
            Une erreur nous empêche de charger ghost.ma. Réessayez dans un
            instant.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "24px",
              cursor: "pointer",
              borderRadius: "12px",
              border: "none",
              backgroundColor: "#3e7bfa",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#fff",
            }}
          >
            Réessayer
          </button>
          {error.digest && (
            <p
              style={{
                margin: "16px 0 0",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "12px",
                color: "#6b7280",
              }}
            >
              Référence : {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
