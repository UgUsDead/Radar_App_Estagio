"use client";

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { apiBase } from "../constants/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Login falhou");
      }

      const { token, user } = await res.json();
      login(token, user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "var(--surface)" }}>
      <div className="panel" style={{ width: "100%", maxWidth: "400px", padding: "2rem" }}>
        <h1 style={{ marginBottom: "0.5rem", textAlign: "center" }}>Painel Radar</h1>
        <p className="muted" style={{ marginBottom: "2rem", textAlign: "center" }}>Inicie sessão para continuar</p>

        {error && <div className="error-banner" style={{ marginBottom: "1rem" }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>Nome de Utilizador</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{ width: "100%", padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>Palavra-passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%", padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)" }}
            />
          </div>
          <button type="submit" className="primary" disabled={loading} style={{ marginTop: "1rem", padding: "0.75rem" }}>
            {loading ? "A iniciar sessão..." : "Iniciar Sessão"}
          </button>
        </form>
      </div>
    </div>
  );
}
