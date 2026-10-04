import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "./db";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.AUTH_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET or AUTH_SECRET is required.");
}

const COOKIE_NAME = "kr_session";

export type Session = {
  userId: string;
  role: string;
  branchId: string | null;
};

declare global {
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

export async function login(
  username: string,
  password: string,
  branchId?: string
) {

  const user = await db.user.findUnique({
    where: { username },
    include: {
      branch: true
    }
  });

  if (!user || !user.active) {
    return null;
  }

  const valid = await bcrypt.compare(
    password,
    user.passwordHash
  );

  if (!valid) {
    return null;
  }

  if (
    branchId &&
    user.branchId &&
    user.branchId !== branchId
  ) {
    return null;
  }

  const payload: Session = {
    userId: user.id,
    role: String(user.role),
    branchId: user.branchId
  };

  const token = jwt.sign(
    payload,
    JWT_SECRET,
    {
      expiresIn: "12h"
    }
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
      branch: user.branch
    }
  };
}

export function setSession(
  res: Response,
  token: string
) {

  res.cookie(
    COOKIE_NAME,
    token,
    {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.COOKIE_SECURE === "true",
      maxAge:
        12 * 60 * 60 * 1000,
      path: "/"
    }
  );
}

export function clearSession(
  res: Response
) {

  res.clearCookie(
    COOKIE_NAME,
    {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.COOKIE_SECURE === "true",
      path: "/"
    }
  );
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {

  const raw =
    req.cookies?.[COOKIE_NAME] ||
    req.headers.authorization?.replace(
      /^Bearer\s+/i,
      ""
    );

  if (!raw) {
    return res.status(401).json({
      error: "Authentication required"
    });
  }

  try {

    const verified =
      jwt.verify(raw, JWT_SECRET);

    if (
      typeof verified !== "object" ||
      verified === null
    ) {
      return res.status(401).json({
        error: "Invalid session"
      });
    }

    const decoded =
      verified as Record<string, unknown>;

    if (
      typeof decoded.userId !== "string" ||
      typeof decoded.role !== "string"
    ) {
      return res.status(401).json({
        error: "Invalid session"
      });
    }

    req.session = {
      userId: decoded.userId,
      role: decoded.role,
      branchId:
        typeof decoded.branchId === "string"
          ? decoded.branchId
          : null
    };

    return next();

  } catch {

    return res.status(401).json({
      error: "Session expired"
    });
  }
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {

  const role = req.session?.role;

  if (
    ![
      "SUPER_ADMIN",
      "ADMIN",
      "MANAGER"
    ].includes(role || "")
  ) {
    return res.status(403).json({
      error: "Admin access required"
    });
  }

  return next();
}

export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {

  if (
    req.session?.role !== "SUPER_ADMIN"
  ) {
    return res.status(403).json({
      error: "Main admin access required"
    });
  }

  return next();
}

export function branchScope(
  req: Request
) {

  const session = req.session;

  if (!session) {
    return undefined;
  }

  const requested =
    typeof req.query.branchId === "string"
      ? req.query.branchId
      : typeof req.body?.branchId === "string"
        ? req.body.branchId
        : "";

  if (
    session.role === "SUPER_ADMIN" ||
    session.role === "ADMIN"
  ) {
    return (
      requested ||
      session.branchId ||
      undefined
    );
  }

  return session.branchId || undefined;
}

export async function hashPassword(
  password: string
) {
  return bcrypt.hash(password, 12);
}

