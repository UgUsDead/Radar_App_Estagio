import admin from "firebase-admin";
import type { Pool } from "pg";
import { logger } from "../logger.js";
import type { EventRecord } from "../types.js";

export class PushNotificationService {
  private initialized = false;

  constructor(private pool: Pool) {}

  /**
   * Initialize Firebase Admin SDK with service account credentials.
   * Call once at startup.
   */
  async initialize(serviceAccountPath: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      const serviceAccount = require(serviceAccountPath);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      // Ensure device_tokens table exists with multi-tenant support
      await this.pool.query("CREATE TABLE IF NOT EXISTS device_tokens (id SERIAL PRIMARY KEY)");
      await this.pool.query("ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)");
      await this.pool.query("ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS token TEXT UNIQUE NOT NULL");
      await this.pool.query("ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS device_id TEXT");
      await this.pool.query("ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS label TEXT");
      await this.pool.query("ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()");
      await this.pool.query("ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()");

      this.initialized = true;
      logger.info("Firebase Admin SDK initialized for push notifications");
    } catch (err: any) {
      logger.error({ err }, "Failed to initialize Firebase Admin SDK — push notifications disabled");
      this.initialized = false;
    }
  }

  /**
   * Register or update a device token.
   */
  async registerToken(token: string, ownerId: number, deviceId?: string, label?: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO device_tokens (token, owner_id, device_id, label, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (token)
       DO UPDATE SET owner_id = EXCLUDED.owner_id,
                     device_id = COALESCE(EXCLUDED.device_id, device_tokens.device_id),
                     label = COALESCE(EXCLUDED.label, device_tokens.label),
                     updated_at = NOW()`,
      [token, ownerId, deviceId || null, label || null]
    );
    logger.info({ deviceId, label }, "Push token registered");
  }

  /**
   * Remove a device token (e.g. on logout).
   */
  async removeToken(token: string, ownerId?: number): Promise<void> {
    const values: unknown[] = [token];
    let ownerClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      ownerClause = ` AND owner_id = $${values.length}`;
    }
    await this.pool.query(`DELETE FROM device_tokens WHERE token = $1${ownerClause}`, values);
  }

  /**
   * Send a data-only push to clear notifications for a room/radar.
   */
  async sendClearNotification(options: { roomId?: number | null; radarId?: string | null; ownerId?: number | null }): Promise<void> {
    if (!this.initialized) return;

    const ownerId = Number.isInteger(options.ownerId) ? options.ownerId : null;
    if (ownerId === null) {
      logger.warn("Clear notification skipped: missing owner_id");
      return;
    }

    const { rows } = await this.pool.query(
      "SELECT token FROM device_tokens WHERE owner_id = $1",
      [ownerId]
    );
    if (rows.length === 0) {
      logger.warn("No push tokens registered, skipping clear notification");
      return;
    }

    const tokens = rows.map((r) => r.token as string);
    const roomIdValue = options.roomId ?? undefined;
    const radarIdValue = options.radarId ?? undefined;

    const data: Record<string, string> = {
      type: "clear",
    };

    if (roomIdValue !== undefined && roomIdValue !== null) {
      data.room_id = String(roomIdValue);
      data.scope = "room";
    } else if (radarIdValue) {
      data.radar_id = String(radarIdValue);
      data.scope = "radar";
    } else {
      data.scope = "all";
    }

    const message: admin.messaging.MulticastMessage = {
      tokens,
      data,
      android: {
        priority: "high",
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      logger.info(
        { successCount: response.successCount, failureCount: response.failureCount },
        "Clear notification push sent"
      );
    } catch (err) {
      logger.error({ err }, "Failed to send clear notification push");
    }
  }

  /**
   * Send a fall alert push notification to all registered devices.
   */
  async sendFallAlert(event: EventRecord & { room_name?: string; patient_name?: string }): Promise<void> {
    if (!this.initialized) return;

    const ownerId = Number.isInteger(event.owner_id) ? event.owner_id : null;
    if (ownerId === null) {
      logger.warn({ radarId: event.radar_id }, "Fall alert skipped: missing owner_id");
      return;
    }

    const { rows } = await this.pool.query(
      "SELECT token FROM device_tokens WHERE owner_id = $1",
      [ownerId]
    );
    if (rows.length === 0) {
      logger.warn("No push tokens registered, skipping fall notification");
      return;
    }

    const tokens = rows.map((r) => r.token as string);
    const timestamp = new Date(event.timestamp).toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Lisbon",
    });

    const roomName = event.room_name || (event.metadata?.room_name as string) || "Quarto desconhecido";
    const patientName = event.patient_name || (event.metadata?.patient_name as string) || "";
    const priority = (event.metadata?.alert_priority as string) || "high";
    const roomIdValue = event.room_id ?? (event.metadata?.room_id as number | string | undefined);
    const roomId = roomIdValue === null || roomIdValue === undefined ? undefined : String(roomIdValue);
    const notificationTag = roomId ? `room-${roomId}` : `radar-${event.radar_id}`;

    const bodyParts = [roomName];
    if (patientName) bodyParts.push(patientName);
    bodyParts.push(timestamp);

    const data: Record<string, string> = {
      type: "fall",
      radar_id: event.radar_id,
      timestamp: event.timestamp,
      priority,
    };
    if (roomId) {
      data.room_id = roomId;
    }

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: "⚠️ Queda Detetada",
        body: bodyParts.join(" — "),
      },
      data,
      android: {
        priority: "high",
        collapseKey: notificationTag,
        notification: {
          channelId: "fall_alerts",
          priority: "max",
          sound: "default",
          defaultVibrateTimings: true,
          defaultSound: true,
          tag: notificationTag,
        },
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      logger.info(
        { successCount: response.successCount, failureCount: response.failureCount },
        "Fall alert push notifications sent"
      );

      // Clean up invalid tokens
      const tokensToRemove: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (
            code === "messaging/invalid-registration-token" ||
            code === "messaging/registration-token-not-registered"
          ) {
            tokensToRemove.push(tokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        await this.pool.query(
          "DELETE FROM device_tokens WHERE token = ANY($1::text[])",
          [tokensToRemove]
        );
        logger.info({ count: tokensToRemove.length }, "Removed invalid push tokens");
      }
    } catch (err) {
      logger.error({ err }, "Failed to send fall alert push notification");
    }
  }
}
