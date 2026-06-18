import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { type ServerConfig } from "./config.js";

export function createAuth(config: ServerConfig) {
  return betterAuth({
    appName: "Underleaf",
    baseURL: config.authUrl,
    secret: config.authSecret,
    trustedOrigins: config.trustedOrigins,
    database: new Database(config.databaseUrl),
    emailAndPassword: {
      enabled: true
    },
    user: {
      modelName: "users",
      fields: {
        name: "display_name",
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at"
      }
    },
    session: {
      modelName: "session",
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at"
      }
    },
    account: {
      modelName: "account",
      fields: {
        userId: "user_id",
        accountId: "account_id",
        providerId: "provider_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at"
      }
    },
    verification: {
      modelName: "verification",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at"
      }
    }
  });
}

export type UnderleafAuth = ReturnType<typeof createAuth>;
