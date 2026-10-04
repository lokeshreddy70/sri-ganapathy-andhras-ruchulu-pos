import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { db } from "./db";

const COOKIE_NAME = "sgar_session";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

export type SessionPayload = {
  id: string;
  userId: string;
  role: string;
  branchId: string | null;
};

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
    JWT_SECRET,
    {
      expiresIn: "12h"
    }
  );
}

export function verifySession(token: string): SessionPayload {
  return jwt.verify(token, JWT_SECRET) as SessionPayload;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function login(
  username: string,
  password: string,
  branchId?: string | null
) {
  const normalizedUsername = String(username || "").trim();

  if (!normalizedUsername || !password) {
    return null;
  }

  /*
   * IMPORTANT:
   * The existing production database contains both:
   *
   *   Lokesh
   *   lokesh
   *
   * Therefore exact username matching MUST happen first.
   *
   * Case-insensitive fallback is used only when an exact
   * username does not exist.
   */

  let user = await db.user.findFirst({
    where: {
      username: normalizedUsername,
      active: true,
      ...(branchId ? { branchId } : {})
    }
  });

  if (!user) {
    user = await db.user.findFirst({
      where: {
        username: {
          equals: normalizedUsername,
          mode: "insensitive"
        },
        active: true,
        ...(branchId ? { branchId } : {})
      },
      orderBy: {
        username: "asc"
      }
    });
  }

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
export function setSession(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000,
    path: "/"
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

function getSession(req: Request) {
  const cookieToken = req.cookies?.[COOKIE_NAME];

  const bearerToken =
    req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.substring(7)
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
  req: Request,
  res: Response,
  next: NextFunction
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
  req: Request,
  res: Response,
  next: NextFunction
) {
  const session = (req as any).session as SessionPayload | undefined;

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
  req: Request,
  res: Response,
  next: NextFunction
) {
  const session = (req as any).session as SessionPayload | undefined;

  if (!session || session.role !== "SUPER_ADMIN") {
    return res.status(403).json({
      error: "Super admin access required"
    });
  }

  next();
}

export function branchScope(
  req: Request,
  requestedBranchId?: string | null
) {
  const session = (req as any).session as SessionPayload | undefined;

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

