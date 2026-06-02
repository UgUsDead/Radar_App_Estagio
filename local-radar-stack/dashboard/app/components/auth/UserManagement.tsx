"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../utils/api";
import { normalizePermissions } from "../../utils/permissions";

const ALL_FEATURES = [
  "live_telemetry",
  "fall_history",
  "sla_metrics",
  "gait_instability",
  "radar_management",
  "geo_fencing",
  "replay_system",
  "fleet_metrics",
  "patient_detail"
];

export function UserManagement() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<string[]>([]);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = async () => {
    try {
      const res = await apiFetch("/users");
      if (!res.ok) throw new Error("Erro ao carregar utilizadores");
      setUsers(await res.json());
    } catch (err: any) {
      setError(err.message || "Erro de ligação");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") {
      void loadUsers();
    }
  }, [user]);

  if (user?.role !== "admin") return null;

  const togglePermission = (feat: string) => {
    setPermissions(prev => prev.includes(feat) ? prev.filter(p => p !== feat) : [...prev, feat]);
  };

  const startEdit = (target: { id: number; permissions?: unknown }) => {
    setEditingUserId(target.id);
    setEditingPermissions(normalizePermissions(target.permissions));
    setError("");
    setSuccess("");
  };

  const toggleEditingPermission = (feat: string) => {
    setEditingPermissions(prev => prev.includes(feat) ? prev.filter(p => p !== feat) : [...prev, feat]);
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditingPermissions([]);
  };

  const saveEdit = async (id: number) => {
    setSavingUserId(id);
    setError("");
    setSuccess("");
    try {
      const res = await apiFetch(`/users/${id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: editingPermissions })
      });
      if (!res.ok) throw new Error("Erro ao atualizar permissoes");
      setSuccess("Permissoes atualizadas com sucesso!");
      setEditingUserId(null);
      setEditingPermissions([]);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar permissoes");
    } finally {
      setSavingUserId(null);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const res = await apiFetch("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, permissions })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess("Utilizador criado com sucesso!");
      setUsername("");
      setPassword("");
      setPermissions([]);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Erro ao criar utilizador");
    }
  };

  const deleteUser = async (id: number) => {
    if (!window.confirm("Eliminar este utilizador?")) return;
    try {
      const res = await apiFetch(`/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao eliminar");
      await loadUsers();
    } catch (err) {
      alert("Erro ao eliminar utilizador.");
    }
  };

  if (!isOpen) {
    return (
      <div style={{ marginBottom: "1rem" }}>
        <button className="secondary" onClick={() => setIsOpen(true)}>Gestão de Utilizadores (Admin)</button>
      </div>
    );
  }

  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
        <div>
          <h2>Gestão de Utilizadores (Admin)</h2>
          <p className="muted" style={{ margin: 0 }}>Crie e gira os acessos de outros utilizadores.</p>
        </div>
        <button className="secondary" onClick={() => setIsOpen(false)}>Fechar</button>
      </div>
      
      {error && <div className="error-banner">{error}</div>}
      {success && <div style={{ padding: "1rem", background: "var(--success-bg)", color: "var(--success-text)", borderRadius: "8px", marginBottom: "1rem" }}>{success}</div>}
      
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
        <form onSubmit={createUser}>
          <div style={{ marginBottom: "1rem" }}>
            <label>Nome de Utilizador</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label>Palavra-passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label>Permissões</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
              {ALL_FEATURES.map(feat => (
                <label key={feat} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: "normal" }}>
                  <input type="checkbox" checked={permissions.includes(feat)} onChange={() => togglePermission(feat)} />
                  {feat}
                </label>
              ))}
            </div>
          </div>
          <button type="submit" className="primary">Criar Utilizador</button>
        </form>

        <div>
          <h3>Lista de Utilizadores</h3>
          {loading ? <p>A carregar...</p> : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {users.map(u => (
                <li key={u.id} style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px", marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                  <div style={{ flex: 1 }}>
                    <strong>{u.username}</strong> ({u.role})
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                      {normalizePermissions(u.permissions).length > 0 ? normalizePermissions(u.permissions).join(", ") : "Sem permissoes especificas"}
                    </div>
                    {editingUserId === u.id && u.role !== "admin" ? (
                      <div style={{ marginTop: "0.75rem" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          {ALL_FEATURES.map(feat => (
                            <label key={`${u.id}-${feat}`} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: "normal" }}>
                              <input type="checkbox" checked={editingPermissions.includes(feat)} onChange={() => toggleEditingPermission(feat)} />
                              {feat}
                            </label>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                          <button className="primary" onClick={() => void saveEdit(u.id)} disabled={savingUserId === u.id}>
                            {savingUserId === u.id ? "A guardar..." : "Guardar"}
                          </button>
                          <button className="secondary" onClick={cancelEdit} disabled={savingUserId === u.id}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {u.role !== "admin" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <button className="secondary" onClick={() => startEdit(u)} disabled={editingUserId === u.id}>Editar permissoes</button>
                      <button className="danger-button" onClick={() => deleteUser(u.id)}>Eliminar</button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
