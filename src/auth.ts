import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db";

export type SessionPayload = {
  id: string;
  userId: string;
  role: string;
  branchId: string | null;
};

const COOKIE_NAME = "sgar_session";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.trim().length < 32) {
    throw new Error(
      "JWT_SECRET is missing or must contain at least 32 characters"
    );
  }

  return secret;
}

export function signSession(user: {
  id: string;
  role: string;
  branchId?: string | null;
}) {
  return jwt.sign(
    {
      id: user.id,
      userId: user.id,
      role: user.role,
      branchId: user.branchId ?? null
    },
    getJwtSecret(),
    {
      expiresIn: "12h"
    }
  );
}

export function verifySession(token: string): SessionPayload {
  return jwt.verify(token, getJwtSecret()) as SessionPayload;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

function normalizeUsername(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export async function login(
  username: string,
  password: string,
  branchId?: string | null
) {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername || !password) {
    return null;
  }

  const users = await db.user.findMany({
    where: {
      active: true
    },
    take: 100
  });

  const user = users.find(
    (item) =>
      normalizeUsername(item.username) === normalizedUsername &&
      (!branchId || item.branchId === branchId || item.branchId === null)
  );

  if (!user) {
    return null;
  }

  const valid = await bcrypt.compare(
    String(password),
    user.passwordHash
  );

  if (!valid) {
    return null;
  }

  const token = signSession(user);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      branchId: user.branchId
    }
  };
}

export function setSession(
  res: express.Response,
  token: string
) {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.NETLIFY === "true";

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 12 * 60 * 60 * 1000,
    path: "/"
  });
}

export function clearSession(res: express.Response) {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.NETLIFY === "true";

  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/"
  });
}

function getSession(req: express.Request) {
  const cookieToken = req.cookies?.[COOKIE_NAME];

  const authorization =
    req.headers.authorization;

  const bearerToken =
    authorization &&
    authorization.startsWith("Bearer ")
      ? authorization.substring(7).trim()
      : undefined;

  const token = cookieToken || bearerToken;

  if (!token) {
    return null;
  }

  try {
    return verifySession(token);
  } catch {
    return null;
  }
}

export function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const session = getSession(req);

  if (!session) {
    return res.status(401).json({
      error: "Authentication required"
    });
  }

  (req as any).session = session;

  next();
}

export function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const session =
    (req as any).session as SessionPayload | undefined;

  if (
    !session ||
    !["SUPER_ADMIN", "ADMIN"].includes(session.role)
  ) {
    return res.status(403).json({
      error: "Admin access required"
    });
  }

  next();
}

export function requireSuperAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const session =
    (req as any).session as SessionPayload | undefined;

  if (!session || session.role !== "SUPER_ADMIN") {
    return res.status(403).json({
      error: "Super admin access required"
    });
  }

  next();
}

export function branchScope(
  req: express.Request,
  requestedBranchId?: string | null
) {
  const session =
    (req as any).session as SessionPayload | undefined;

  if (!session) {
    return null;
  }

  if (
    session.role === "SUPER_ADMIN" ||
    session.role === "ADMIN"
  ) {
    return requestedBranchId || undefined;
  }

  return session.branchId;
}
