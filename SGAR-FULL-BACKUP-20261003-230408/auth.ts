import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "./db";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be configured and at least 32 characters long");
}

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: string;
  active: boolean;
  branchId: string | null;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
) {
  return bcrypt.compare(password, hash);
}

export async function login(
  username: string,
  password: string,
  requestedBranchId?: string
): Promise<SessionUser> {

  const user = await db.user.findUnique({
    where: {
      username: username.trim()
    }
  });

  if (!user || !user.active) {
    throw new Error("Invalid username or password");
  }

  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    throw new Error("Invalid username or password");
  }

  if (
    requestedBranchId &&
    user.branchId &&
    requestedBranchId !== user.branchId &&
    user.role !== "SUPER_ADMIN"
  ) {
    throw new Error("You do not have access to this branch");
  }

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    active: user.active,
    branchId: user.branchId
  };
}

export function signSession(user: SessionUser) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      branchId: user.branchId
    },
    JWT_SECRET!,
    {
      expiresIn: "12h"
    }
  );
}

export function verifySession(token: string): SessionUser {
  const payload = jwt.verify(token, JWT_SECRET!) as any;

  return {
    id: String(payload.sub),
    name: "",
    username: "",
    role: String(payload.role),
    active: true,
    branchId: payload.branchId
      ? String(payload.branchId)
      : null
  };
}