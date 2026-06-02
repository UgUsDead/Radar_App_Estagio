import express from "express";
import bcrypt from "bcrypt";
import { Pool } from "pg";
import { logger } from "../logger.js";
import { requireAdmin } from "../middleware/auth.js";

export function getUsersRouter(pool: Pool): express.Router {
  const router = express.Router();

  // All user management requires admin
  router.use(requireAdmin);

  router.get("/", async (_req, res) => {
    try {
      const { rows } = await pool.query("SELECT id, username, role, permissions, created_at FROM users ORDER BY created_at DESC");
      res.json(rows);
    } catch (err) {
      logger.error({ err }, "Failed to fetch users");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/", async (req, res) => {
    const { username, password, permissions } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "Username and password required" });
      return;
    }

    try {
      const hash = await bcrypt.hash(password, 10);
      const perms = Array.isArray(permissions) ? permissions : [];
      
      const { rows } = await pool.query(
        "INSERT INTO users (username, password_hash, role, permissions) VALUES ($1, $2, 'user', $3::jsonb) RETURNING id, username, role, permissions",
        [username, hash, JSON.stringify(perms)]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err.code === "23505") { // unique_violation
        res.status(409).json({ error: "Username already exists" });
        return;
      }
      logger.error({ err }, "Failed to create user");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.put("/:id/permissions", async (req, res) => {
    const userId = Number(req.params.id);
    const { permissions } = req.body;
    
    if (!Array.isArray(permissions)) {
      res.status(400).json({ error: "Permissions must be an array" });
      return;
    }

    try {
      const { rowCount } = await pool.query(
        "UPDATE users SET permissions = $1::jsonb, updated_at = NOW() WHERE id = $2 AND role = 'user'",
        [JSON.stringify(permissions), userId]
      );
      if (rowCount === 0) {
        res.status(404).json({ error: "User not found or cannot modify admin" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to update permissions");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.delete("/:id", async (req, res) => {
    const userId = Number(req.params.id);
    try {
      const { rowCount } = await pool.query("DELETE FROM users WHERE id = $1 AND role = 'user'", [userId]);
      if (rowCount === 0) {
        res.status(404).json({ error: "User not found or cannot delete admin" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to delete user");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
