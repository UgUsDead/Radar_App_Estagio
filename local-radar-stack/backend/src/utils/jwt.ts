import { logger } from "../logger.js";

const DEFAULT_DEV_SECRET = "default_development_secret";

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length > 0) {
    return secret;
  }

  const env = process.env.NODE_ENV ?? "development";
  if (env === "development" || env === "test") {
    logger.warn("JWT_SECRET is not configured; using default development secret");
    return DEFAULT_DEV_SECRET;
  }

  logger.error("JWT_SECRET is not configured; refusing to start in production");
  throw new Error("JWT_SECRET must be configured in production");
}
