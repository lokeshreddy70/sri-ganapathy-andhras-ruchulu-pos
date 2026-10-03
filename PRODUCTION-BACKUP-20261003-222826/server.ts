import "dotenv/config";

import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import crypto from "crypto";

import cookieParser from "cookie-parser";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import QRCode from "qrcode";
import PDFDocument from "pdfkit";

import {
  Prisma,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  Role
} from "@prisma/client";

import { db } from "./db";
import {
  login,
  signSession,
  verifySession,
  hashPassword
} from "./auth";

const app = express();

const PORT = Number(process.env.PORT || 4000);
const IS_NETLIFY = process.env.NETLIFY === "true";

const publicDir = path.resolve(process.cwd(), "public");

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(compression());

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb"
  })
);

app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false
});

const publicOrderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false
});

function safeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong";
}

function getSession(req: express.Request) {
  const token =
    req.cookies?.sgar_session ||
    (
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.substring(7)
        : undefined
    );

  if (!token) {
    return null;
  }

  try {
    return verifySession(token);
  } catch {
    return null;
  }
}

function requireAuth(
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

function setSession(
  res: express.Response,
  user: any
) {
  const token = signSession(user);

  res.cookie("sgar_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000,
    path: "/"
  });
}

function clearSession(res: express.Response) {
  res.clearCookie("sgar_session", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

function isAdminRole(role: string) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

function isManagerRole(role: string) {
  return isAdminRole(role) || role === "MANAGER";
}

function branchScope(req: express.Request) {
  const session = (req as any).session;

  if (!session) {
    return null;
  }

  if (session.role === "SUPER_ADMIN") {
    const requested = String(
      req.query.branchId ||
      req.body?.branchId ||
      ""
    ).trim();

    return requested || null;
  }

  return session.branchId;
}

async function ensureBranchAccess(
  req: express.Request,
  branchId: string
) {
  const session = (req as any).session;

  if (!session) {
    return false;
  }

  if (session.role === "SUPER_ADMIN") {
    return true;
  }

  return session.branchId === branchId;
}

async function audit(
  action: string,
  entity: string,
  entityId: string | null,
  metadata: any,
  userId?: string,
  branchId?: string | null
) {
  try {
    await db.auditLog.create({
      data: {
        action,
        entity,
        entityId: entityId || undefined,
        metadata: metadata || undefined,
        userId: userId || undefined,
        branchId: branchId || undefined
      }
    });
  } catch (error) {
    console.error("AUDIT_ERROR", error);
  }
}

function money(value: any) {
  return Number(value || 0);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function makeClientRequestId() {
  return crypto.randomUUID();
}

async function getBranchOrThrow(
  branchId: string
) {
  const branch = await db.branch.findUnique({
    where: {
      id: branchId
    }
  });

  if (!branch || !branch.active) {
    throw new Error("Branch not found or inactive");
  }

  return branch;
}

async function validateBench(
  branchId: string,
  benchId?: string | null
) {
  if (!benchId) {
    return null;
  }

  const bench = await db.bench.findFirst({
    where: {
      id: benchId,
      branchId,
      active: true
    }
  });

  if (!bench) {
    throw new Error("Invalid bench");
  }

  return bench;
}

async function calculateLines(
  branchId: string,
  incomingLines: Array<{
    menuItemId: string;
    quantity: number;
  }>
) {
  const ids = [
    ...new Set(
      incomingLines.map(
        line => line.menuItemId
      )
    )
  ];

  const products = await db.menuItem.findMany({
    where: {
      id: {
        in: ids
      },
      branchId,
      active: true
    }
  });

  if (products.length !== ids.length) {
    throw new Error(
      "One or more menu items are unavailable"
    );
  }

  const productMap = new Map(
    products.map(item => [item.id, item])
  );

  const lines = incomingLines.map(line => {
    const item = productMap.get(line.menuItemId);

    if (!item) {
      throw new Error("Menu item not found");
    }

    if (item.soldOut) {
      throw new Error(
        `${item.name} is currently sold out`
      );
    }

    const quantity = Number(line.quantity);

    if (
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      quantity > 999
    ) {
      throw new Error(
        `Invalid quantity for ${item.name}`
      );
    }

    const unitPrice = money(item.price);

    return {
      menuItemId: item.id,
      quantity,
      unitPrice,
      lineTotal: roundMoney(
        unitPrice * quantity
      ),
      menuItem: item
    };
  });

  return lines;
}

async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  branchId: string
) {
  const branch = await tx.branch.update({
    where: {
      id: branchId
    },
    data: {
      nextInvoiceNumber: {
        increment: 1
      }
    },
    select: {
      nextInvoiceNumber: true,
      invoicePrefix: true
    }
  });

  const number =
    branch.nextInvoiceNumber - 1;

  const invoiceNumber =
    `${branch.invoicePrefix || "INV"}-${String(number).padStart(6, "0")}`;

  return {
    number,
    invoiceNumber
  };
}

async function createOrder(
  data: {
    branchId: string;
    benchId?: string | null;
    source: OrderSource;
    clientRequestId?: string;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    paymentMethod?: PaymentMethod;
    discount?: number;
    lines: Array<{
      menuItemId: string;
      quantity: number;
    }>;
  },
  cashierId?: string
) {

  if (data.clientRequestId) {
    const existing =
      await db.order.findUnique({
        where: {
          clientRequestId:
            data.clientRequestId
        },
        include: {
          branch: true,
          bench: true,
          cashier: {
            select: {
              name: true
            }
          },
          lines: {
            include: {
              menuItem: true
            }
          }
        }
      });

    if (existing) {
      return existing;
    }
  }

  return db.$transaction(
    async tx => {

      const branch =
        await tx.branch.findUnique({
          where: {
            id: data.branchId
          }
        });

      if (!branch || !branch.active) {
        throw new Error(
          "Branch not found or inactive"
        );
      }

      if (
        data.source === "QR" &&
        !data.benchId
      ) {
        throw new Error(
          "QR orders must have a valid bench"
        );
      }

      if (data.benchId) {
        const bench =
          await tx.bench.findFirst({
            where: {
              id: data.benchId,
              branchId: data.branchId,
              active: true
            }
          });

        if (!bench) {
          throw new Error("Invalid bench");
        }
      }

      const ids = [
        ...new Set(
          data.lines.map(
            x => x.menuItemId
          )
        )
      ];

      const products =
        await tx.menuItem.findMany({
          where: {
            id: {
              in: ids
            },
            branchId: data.branchId,
            active: true
          }
        });

      if (products.length !== ids.length) {
        throw new Error(
          "One or more menu items are unavailable"
        );
      }

      const map = new Map(
        products.map(
          item => [item.id, item]
        )
      );

      const lines = data.lines.map(
        line => {

          const item =
            map.get(line.menuItemId);

          if (!item) {
            throw new Error(
              "Menu item not found"
            );
          }

          if (item.soldOut) {
            throw new Error(
              `${item.name} is currently sold out`
            );
          }

          const quantity =
            Number(line.quantity);

          if (
            !Number.isInteger(quantity) ||
            quantity <= 0 ||
            quantity > 999
          ) {
            throw new Error(
              `Invalid quantity for ${item.name}`
            );
          }

          const unitPrice =
            money(item.price);

          return {
            menuItemId: item.id,
            quantity,
            unitPrice,
            lineTotal:
              roundMoney(
                unitPrice * quantity
              )
          };
        }
      );

      const subtotal =
        roundMoney(
          lines.reduce(
            (sum, line) =>
              sum + line.lineTotal,
            0
          )
        );

      const discount =
        Math.min(
          Math.max(
            Number(data.discount || 0),
            0
          ),
          subtotal
        );

      const taxable =
        roundMoney(
          subtotal - discount
        );

      const tax =
        branch.taxEnabled
          ? roundMoney(
              taxable *
              (money(branch.taxRate) / 100)
            )
          : 0;

      const total =
        roundMoney(
          taxable + tax
        );

      const sequence =
        await tx.branch.update({
          where: {
            id: data.branchId
          },
          data: {
            nextInvoiceNumber: {
              increment: 1
            }
          },
          select: {
            nextInvoiceNumber: true,
            invoicePrefix: true
          }
        });

      const number =
        sequence.nextInvoiceNumber - 1;

      const invoiceNumber =
        `${sequence.invoicePrefix || "INV"}-${String(number).padStart(6, "0")}`;

      return tx.order.create({
        data: {
          number,
          invoiceNumber,
          clientRequestId:
            data.clientRequestId ||
            undefined,

          source: data.source,

          status:
            data.source === "QR"
              ? "PENDING"
              : "ACCEPTED",

          paymentMethod:
            data.paymentMethod ||
            undefined,

          paymentStatus:
            data.paymentMethod
              ? "PAID"
              : "UNPAID",

          customerName:
            data.customerName ||
            undefined,

          customerPhone:
            data.customerPhone ||
            undefined,

          notes:
            data.notes ||
            undefined,

          subtotal,
          discount,
          tax,
          total,

          branchId:
            data.branchId,

          benchId:
            data.benchId ||
            undefined,

          cashierId:
            cashierId ||
            undefined,

          lines: {
            create: lines.map(
              line => ({
                menuItemId:
                  line.menuItemId,
                quantity:
                  line.quantity,
                unitPrice:
                  line.unitPrice,
                lineTotal:
                  line.lineTotal
              })
            )
          }
        },

        include: {
          branch: true,
          bench: true,
          cashier: {
            select: {
              name: true
            }
          },
          lines: {
            include: {
              menuItem: true
            }
          }
        }
      });
    }
  );
}

function publicOrder(order: any) {
  return {
    id: order.id,
    number: order.number,
    invoiceNumber:
      order.invoiceNumber,
    source: order.source,
    status: order.status,
    paymentMethod:
      order.paymentMethod,
    paymentStatus:
      order.paymentStatus,
    customerName:
      order.customerName,
    customerPhone:
      order.customerPhone,
    notes: order.notes,
    subtotal:
      money(order.subtotal),
    discount:
      money(order.discount),
    tax:
      money(order.tax),
    total:
      money(order.total),
    branch: order.branch
      ? {
          id: order.branch.id,
          name: order.branch.name,
          code: order.branch.code
        }
      : null,
    bench: order.bench
      ? {
          id: order.bench.id,
          label: order.bench.label
        }
      : null,
    cashier:
      order.cashier
        ? {
            name: order.cashier.name
          }
        : null,
    lines:
      (order.lines || []).map(
        (line: any) => ({
          id: line.id,
          quantity: line.quantity,
          unitPrice:
            money(line.unitPrice),
          lineTotal:
            money(line.lineTotal),
          menuItem: line.menuItem
            ? {
                id:
                  line.menuItem.id,
                name:
                  line.menuItem.name,
                category:
                  line.menuItem.category,
                imageUrl:
                  line.menuItem.imageUrl
              }
            : null
        })
      ),
    createdAt:
      order.createdAt,
    updatedAt:
      order.updatedAt
  };
}

/* ============================================================
   HEALTH
   ============================================================ */

app.get("/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;

    res.json({
      ok: true,
      service: "Sri Ganapathy Andhra's Ruchulu POS",
      database: true,
      environment:
        process.env.NODE_ENV ||
        "development",
      netlify: IS_NETLIFY,
      timestamp:
        new Date().toISOString()
    });
  } catch {
    res.status(503).json({
      ok: false,
      database: false
    });
  }
});

/* ============================================================
   AUTH
   ============================================================ */

app.post(
  "/api/auth/login",
  authLimiter,
  async (req, res) => {
    try {
      const username =
        String(
          req.body?.username || ""
        ).trim();

      const password =
        String(
          req.body?.password || ""
        );

      const branchId =
        req.body?.branchId
          ? String(
              req.body.branchId
            )
          : undefined;

      if (!username || !password) {
        return res.status(400).json({
          error:
            "Username and password are required"
        });
      }

      const user =
        await login(
          username,
          password,
          branchId
        );

      setSession(res, user);

      return res.json({
        ok: true,
        user
      });

    } catch (error) {
      return res.status(401).json({
        error: safeError(error)
      });
    }
  }
);

app.post(
  "/api/auth/logout",
  (_req, res) => {
    clearSession(res);

    res.json({
      ok: true
    });
  }
);

app.get(
  "/api/me",
  requireAuth,
  async (req, res) => {

    const session =
      (req as any).session;

    const user =
      await db.user.findUnique({
        where: {
          id: session.id
        },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          active: true,
          branchId: true,
          createdAt: true,
          updatedAt: true,
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
              slug: true,
              active: true
            }
          }
        }
      });

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    return res.json({
      user
    });
  }
);

app.post(
  "/api/me/password",
  requireAuth,
  async (req, res) => {
    try {
      const session =
        (req as any).session;

      const currentPassword =
        String(
          req.body?.currentPassword ||
          ""
        );

      const newPassword =
        String(
          req.body?.newPassword ||
          ""
        );

      if (
        currentPassword.length < 1 ||
        newPassword.length < 8
      ) {
        return res.status(400).json({
          error:
            "New password must contain at least 8 characters"
        });
      }

      const user =
        await db.user.findUnique({
          where: {
            id: session.id
          }
        });

      if (!user) {
        return res.status(404).json({
          error: "User not found"
        });
      }

      const bcrypt =
        await import("bcryptjs");

      const valid =
        await bcrypt.compare(
          currentPassword,
          user.passwordHash
        );

      if (!valid) {
        return res.status(400).json({
          error:
            "Current password is incorrect"
        });
      }

      const passwordHash =
        await hashPassword(
          newPassword
        );

      await db.user.update({
        where: {
          id: user.id
        },
        data: {
          passwordHash
        }
      });

      await audit(
        "PASSWORD_CHANGED",
        "User",
        user.id,
        {},
        user.id,
        user.branchId
      );

      clearSession(res);

      return res.json({
        ok: true,
        message:
          "Password changed. Please login again."
      });

    } catch (error) {
      return res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

/* ============================================================
   USER ADMINISTRATION
   ============================================================ */

app.get(
  "/api/users",
  requireAuth,
  async (req, res) => {

    try {

      const session =
        (req as any).session;

      if (!isAdminRole(session.role)) {
        return res.status(403).json({
          error:
            "Only administrators can view users"
        });
      }

      const requestedBranch =
        req.query.branchId
          ? String(req.query.branchId)
          : "";

      const branchId =
        requestedBranch ||
        session.branchId ||
        undefined;

      const where: any = {};

      if (
        session.role !== "SUPER_ADMIN"
      ) {
        where.branchId =
          session.branchId;
      }
      else if (branchId) {
        where.branchId =
          branchId;
      }

      const users =
        await db.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
            active: true,
            branchId: true,
            createdAt: true,
            updatedAt: true,
            branch: {
              select: {
                id: true,
                name: true,
                code: true
              }
            }
          },
          orderBy: {
            name: "asc"
          }
        });

      res.json(users);

    } catch (error) {

      res.status(400).json({
        error:
          safeError(error)
      });

    }
  }
);

app.post(
  "/api/users",
  requireAuth,
  async (req, res) => {

    try {

      const session =
        (req as any).session;

      if (!isAdminRole(session.role)) {
        return res.status(403).json({
          error:
            "Only administrators can create users"
        });
      }

      const name =
        String(
          req.body?.name || ""
        ).trim();

      const username =
        String(
          req.body?.username || ""
        ).trim();

      const password =
        String(
          req.body?.password || ""
        );

      const role =
        String(
          req.body?.role || ""
        );

      const branchId =
        String(
          req.body?.branchId || ""
        );

      const allowedRoles = [
        "ADMIN",
        "MANAGER",
        "CASHIER",
        "KITCHEN"
      ];

      if (
        !name ||
        !username ||
        password.length < 8 ||
        !allowedRoles.includes(role) ||
        !branchId
      ) {
        return res.status(400).json({
          error:
            "Name, username, password, role and branch are required"
        });
      }

      if (
        session.role !== "SUPER_ADMIN" &&
        session.branchId !== branchId
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const branch =
        await db.branch.findUnique({
          where: {
            id: branchId
          }
        });

      if (!branch || !branch.active) {
        return res.status(400).json({
          error:
            "Invalid branch"
        });
      }

      const existing =
        await db.user.findUnique({
          where: {
            username
          }
        });

      if (existing) {
        return res.status(409).json({
          error:
            "Username already exists"
        });
      }

      const passwordHash =
        await hashPassword(
          password
        );

      const user =
        await db.user.create({
          data: {
            name,
            username,
            passwordHash,
            role: role as Role,
            active: true,
            branchId
          },
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
            active: true,
            branchId: true
          }
        });

      await audit(
        "USER_CREATED",
        "User",
        user.id,
        {
          username:
            user.username,
          role:
            user.role
        },
        session.id,
        branchId
      );

      res.status(201).json({
        user
      });

    } catch (error) {

      res.status(400).json({
        error:
          safeError(error)
      });

    }
  }
);

/* ============================================================
   BRANCHES
   ============================================================ */

app.get(
  "/api/branches",
  requireAuth,
  async (req, res) => {
    const session =
      (req as any).session;

    if (
      !isAdminRole(session.role)
    ) {
      if (!session.branchId) {
        return res.json([]);
      }

      const branch =
        await db.branch.findUnique({
          where: {
            id: session.branchId
          },
          select: {
            id: true,
            name: true,
            code: true,
            slug: true,
            active: true,
            address: true,
            phone: true
          }
        });

      return res.json(
        branch ? [branch] : []
      );
    }

    const branches =
      await db.branch.findMany({
        orderBy: {
          name: "asc"
        },
        select: {
          id: true,
          name: true,
          code: true,
          slug: true,
          active: true,
          address: true,
          phone: true,
          gstin: true,
          invoicePrefix: true,
          receiptHeader: true,
          receiptFooter: true,
          logoUrl: true,
          invoiceTitle: true,
          receiptPaperWidth: true,
          timezone: true,
          currency: true,
          nextInvoiceNumber: true,
          upiId: true,
          upiName: true,
          paymentCashEnabled: true,
          paymentUpiEnabled: true,
          paymentCardEnabled: true,
          taxEnabled: true,
          taxRate: true
        }
      });

    res.json(branches);
  }
);

app.post(
  "/api/branches",
  requireAuth,
  async (req, res) => {
    try {
      const session =
        (req as any).session;

      if (!isAdminRole(session.role)) {
        return res.status(403).json({
          error:
            "Only administrators can create branches"
        });
      }

      const name =
        String(
          req.body?.name || ""
        ).trim();

      const code =
        String(
          req.body?.code || ""
        ).trim().toUpperCase();

      const slug =
        String(
          req.body?.slug ||
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
        ).trim();

      if (!name || !code || !slug) {
        return res.status(400).json({
          error:
            "Branch name, code and slug are required"
        });
      }

      const branch =
        await db.branch.create({
          data: {
            name,
            code,
            slug,
            address:
              req.body?.address ||
              undefined,
            phone:
              req.body?.phone ||
              undefined,
            gstin:
              req.body?.gstin ||
              undefined,
            invoicePrefix:
              req.body?.invoicePrefix ||
              "INV",
            receiptHeader:
              req.body?.receiptHeader ||
              undefined,
            receiptFooter:
              req.body?.receiptFooter ||
              undefined,
            logoUrl:
              req.body?.logoUrl ||
              undefined,
            invoiceTitle:
              req.body?.invoiceTitle ||
              "TAX INVOICE",
            receiptPaperWidth:
              Number(
                req.body?.receiptPaperWidth ||
                80
              ),
            timezone:
              req.body?.timezone ||
              "Asia/Kolkata",
            currency:
              req.body?.currency ||
              "INR",
            upiId:
              req.body?.upiId ||
              undefined,
            upiName:
              req.body?.upiName ||
              undefined,
            paymentCashEnabled:
              req.body?.paymentCashEnabled !== false,
            paymentUpiEnabled:
              req.body?.paymentUpiEnabled !== false,
            paymentCardEnabled:
              req.body?.paymentCardEnabled !== false,
            taxEnabled:
              req.body?.taxEnabled === true,
            taxRate:
              Number(
                req.body?.taxRate || 0
              )
          }
        });

      await audit(
        "BRANCH_CREATED",
        "Branch",
        branch.id,
        {
          name: branch.name,
          code: branch.code
        },
        session.id,
        branch.id
      );

      res.status(201).json({
        branch
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

app.patch(
  "/api/branches/:id",
  requireAuth,
  async (req, res) => {
    try {
      const session =
        (req as any).session;

      if (!isAdminRole(session.role)) {
        return res.status(403).json({
          error:
            "Only administrators can update branch settings"
        });
      }

      const id =
        req.params.id;

      const branch =
        await db.branch.update({
          where: {
            id
          },
          data: {
            name:
              req.body?.name !== undefined
                ? String(req.body.name).trim()
                : undefined,

            code:
              req.body?.code !== undefined
                ? String(req.body.code)
                    .trim()
                    .toUpperCase()
                : undefined,

            slug:
              req.body?.slug !== undefined
                ? String(req.body.slug)
                    .trim()
                : undefined,

            address:
              req.body?.address !== undefined
                ? req.body.address || null
                : undefined,

            phone:
              req.body?.phone !== undefined
                ? req.body.phone || null
                : undefined,

            gstin:
              req.body?.gstin !== undefined
                ? req.body.gstin || null
                : undefined,

            invoicePrefix:
              req.body?.invoicePrefix !== undefined
                ? String(req.body.invoicePrefix)
                : undefined,

            receiptHeader:
              req.body?.receiptHeader !== undefined
                ? req.body.receiptHeader || null
                : undefined,

            receiptFooter:
              req.body?.receiptFooter !== undefined
                ? req.body.receiptFooter || null
                : undefined,

            logoUrl:
              req.body?.logoUrl !== undefined
                ? req.body.logoUrl || null
                : undefined,

            invoiceTitle:
              req.body?.invoiceTitle !== undefined
                ? String(req.body.invoiceTitle)
                : undefined,

            receiptPaperWidth:
              req.body?.receiptPaperWidth !== undefined
                ? Number(req.body.receiptPaperWidth)
                : undefined,

            timezone:
              req.body?.timezone !== undefined
                ? String(req.body.timezone)
                : undefined,

            currency:
              req.body?.currency !== undefined
                ? String(req.body.currency)
                : undefined,

            upiId:
              req.body?.upiId !== undefined
                ? req.body.upiId || null
                : undefined,

            upiName:
              req.body?.upiName !== undefined
                ? req.body.upiName || null
                : undefined,

            paymentCashEnabled:
              req.body?.paymentCashEnabled !== undefined
                ? Boolean(req.body.paymentCashEnabled)
                : undefined,

            paymentUpiEnabled:
              req.body?.paymentUpiEnabled !== undefined
                ? Boolean(req.body.paymentUpiEnabled)
                : undefined,

            paymentCardEnabled:
              req.body?.paymentCardEnabled !== undefined
                ? Boolean(req.body.paymentCardEnabled)
                : undefined,

            taxEnabled:
              req.body?.taxEnabled !== undefined
                ? Boolean(req.body.taxEnabled)
                : undefined,

            taxRate:
              req.body?.taxRate !== undefined
                ? Number(req.body.taxRate)
                : undefined,

            active:
              req.body?.active !== undefined
                ? Boolean(req.body.active)
                : undefined
          }
        });

      await audit(
        "BRANCH_UPDATED",
        "Branch",
        branch.id,
        req.body,
        session.id,
        branch.id
      );

      res.json({
        branch
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

/* ============================================================
   MENU
   ============================================================ */

app.get(
  "/api/menu",
  requireAuth,
  async (req, res) => {
    try {
      const branchId =
        branchScope(req);

      if (!branchId) {
        return res.status(400).json({
          error:
            "A branch is required"
        });
      }

      const allowed =
        await ensureBranchAccess(
          req,
          branchId
        );

      if (!allowed) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const menu =
        await db.menuItem.findMany({
          where: {
            branchId
          },
          orderBy: [
            {
              sortOrder: "asc"
            },
            {
              category: "asc"
            },
            {
              name: "asc"
            }
          ]
        });

      res.json(
        menu.map(item => ({
          ...item,
          price: money(item.price),
          taxRate:
            item.taxRate === null
              ? null
              : money(item.taxRate)
        }))
      );

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

app.get(
  "/api/menu/:id",
  requireAuth,
  async (req, res) => {
    try {
      const item =
        await db.menuItem.findUnique({
          where: {
            id: String(req.params.id)
          }
        });

      if (!item) {
        return res.status(404).json({
          error:
            "Menu item not found"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          item.branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      res.json({
        ...item,
        price: money(item.price),
        taxRate:
          item.taxRate === null
            ? null
            : money(item.taxRate)
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

app.post(
  "/api/menu",
  requireAuth,
  async (req, res) => {
    try {
      const session =
        (req as any).session;

      if (!isAdminRole(session.role)) {
        return res.status(403).json({
          error:
            "Only administrators can manage menu items"
        });
      }

      const branchId =
        String(
          req.body?.branchId ||
          session.branchId ||
          ""
        ).trim();

      if (!branchId) {
        return res.status(400).json({
          error:
            "Branch is required"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const name =
        String(
          req.body?.name || ""
        ).trim();

      const category =
        String(
          req.body?.category || ""
        ).trim();

      const price =
        Number(req.body?.price);

      if (
        !name ||
        !category ||
        !Number.isFinite(price) ||
        price < 0
      ) {
        return res.status(400).json({
          error:
            "Name, category and valid price are required"
        });
      }

      const item =
        await db.menuItem.create({
          data: {
            name,
            category,

            description:
              req.body?.description ||
              undefined,

            barcode:
              req.body?.barcode ||
              undefined,

            hsnCode:
              req.body?.hsnCode ||
              undefined,

            taxRate:
              req.body?.taxRate !== undefined
                ? Number(req.body.taxRate)
                : undefined,

            price,

            active:
              req.body?.active !== false,

            soldOut:
              req.body?.soldOut === true,

            sortOrder:
              Number(
                req.body?.sortOrder || 0
              ),

            imageUrl:
              req.body?.imageUrl ||
              undefined,

            branchId
          }
        });

      await audit(
        "MENU_CREATED",
        "MenuItem",
        item.id,
        {
          name: item.name,
          price: money(item.price)
        },
        session.id,
        branchId
      );

      res.status(201).json({
        item: {
          ...item,
          price: money(item.price)
        }
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

app.patch(
  "/api/menu/:id",
  requireAuth,
  async (req, res) => {
    try {
      const session =
        (req as any).session;

      if (!isAdminRole(session.role)) {
        return res.status(403).json({
          error:
            "Only administrators can manage menu items"
        });
      }

      const existing =
        await db.menuItem.findUnique({
          where: {
            id: String(req.params.id)
          }
        });

      if (!existing) {
        return res.status(404).json({
          error:
            "Menu item not found"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          existing.branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const item =
        await db.menuItem.update({
          where: {
            id: existing.id
          },
          data: {
            name:
              req.body?.name !== undefined
                ? String(req.body.name).trim()
                : undefined,

            category:
              req.body?.category !== undefined
                ? String(req.body.category).trim()
                : undefined,

            description:
              req.body?.description !== undefined
                ? req.body.description || null
                : undefined,

            barcode:
              req.body?.barcode !== undefined
                ? req.body.barcode || null
                : undefined,

            hsnCode:
              req.body?.hsnCode !== undefined
                ? req.body.hsnCode || null
                : undefined,

            taxRate:
              req.body?.taxRate !== undefined
                ? Number(req.body.taxRate)
                : undefined,

            price:
              req.body?.price !== undefined
                ? Number(req.body.price)
                : undefined,

            active:
              req.body?.active !== undefined
                ? Boolean(req.body.active)
                : undefined,

            soldOut:
              req.body?.soldOut !== undefined
                ? Boolean(req.body.soldOut)
                : undefined,

            sortOrder:
              req.body?.sortOrder !== undefined
                ? Number(req.body.sortOrder)
                : undefined,

            imageUrl:
              req.body?.imageUrl !== undefined
                ? req.body.imageUrl || null
                : undefined
          }
        });

      await audit(
        "MENU_UPDATED",
        "MenuItem",
        item.id,
        req.body,
        session.id,
        item.branchId
      );

      res.json({
        item: {
          ...item,
          price: money(item.price),
          taxRate:
            item.taxRate === null
              ? null
              : money(item.taxRate)
        }
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

app.delete(
  "/api/menu/:id",
  requireAuth,
  async (req, res) => {
    try {
      const session =
        (req as any).session;

      if (!isAdminRole(session.role)) {
        return res.status(403).json({
          error:
            "Only administrators can delete menu items"
        });
      }

      const item =
        await db.menuItem.findUnique({
          where: {
            id: String(req.params.id)
          }
        });

      if (!item) {
        return res.status(404).json({
          error:
            "Menu item not found"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          item.branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const history =
        await db.orderLine.count({
          where: {
            menuItemId: item.id
          }
        });

      if (history > 0) {
        const updated =
          await db.menuItem.update({
            where: {
              id: item.id
            },
            data: {
              active: false,
              soldOut: true
            }
          });

        await audit(
          "MENU_ARCHIVED",
          "MenuItem",
          item.id,
          {
            reason:
              "Historical orders exist"
          },
          session.id,
          item.branchId
        );

        return res.json({
          ok: true,
          archived: true,
          item: updated
        });
      }

      await db.menuItem.delete({
        where: {
          id: item.id
        }
      });

      await audit(
        "MENU_DELETED",
        "MenuItem",
        item.id,
        {},
        session.id,
        item.branchId
      );

      res.json({
        ok: true,
        deleted: true
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

/* ============================================================
   BENCH / QR
   ============================================================ */

app.get(
  "/api/benches",
  requireAuth,
  async (req, res) => {
    try {
      const branchId =
        branchScope(req);

      if (!branchId) {
        return res.status(400).json({
          error:
            "A branch is required"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const benches =
        await db.bench.findMany({
          where: {
            branchId
          },
          orderBy: {
            label: "asc"
          }
        });

      res.json(benches);

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

app.post(
  "/api/benches",
  requireAuth,
  async (req, res) => {
    try {
      const session =
        (req as any).session;

      if (!isAdminRole(session.role)) {
        return res.status(403).json({
          error:
            "Only administrators can manage benches"
        });
      }

      const branchId =
        String(
          req.body?.branchId ||
          session.branchId ||
          ""
        );

      const label =
        String(
          req.body?.label || ""
        ).trim();

      if (!branchId || !label) {
        return res.status(400).json({
          error:
            "Branch and bench label are required"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const token =
        crypto.randomBytes(18)
          .toString("base64url");

      const bench =
        await db.bench.create({
          data: {
            label,
            token,
            branchId,
            active:
              req.body?.active !== false
          }
        });

      await audit(
        "BENCH_CREATED",
        "Bench",
        bench.id,
        {
          label: bench.label
        },
        session.id,
        branchId
      );

      res.status(201).json({
        bench
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

app.patch(
  "/api/benches/:id",
  requireAuth,
  async (req, res) => {
    try {
      const session =
        (req as any).session;

      if (!isAdminRole(session.role)) {
        return res.status(403).json({
          error:
            "Only administrators can manage benches"
        });
      }

      const existing =
        await db.bench.findUnique({
          where: {
            id: String(req.params.id)
          }
        });

      if (!existing) {
        return res.status(404).json({
          error:
            "Bench not found"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          existing.branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const bench =
        await db.bench.update({
          where: {
            id: existing.id
          },
          data: {
            label:
              req.body?.label !== undefined
                ? String(req.body.label).trim()
                : undefined,

            active:
              req.body?.active !== undefined
                ? Boolean(req.body.active)
                : undefined
          }
        });

      await audit(
        "BENCH_UPDATED",
        "Bench",
        bench.id,
        req.body,
        session.id,
        bench.branchId
      );

      res.json({
        bench
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

app.get(
  "/api/qr/:token.png",
  async (req, res) => {
    try {
      const bench =
        await db.bench.findUnique({
          where: {
            token: String(req.params.token)
          },
          include: {
            branch: true
          }
        });

      if (
        !bench ||
        !bench.active ||
        !bench.branch.active
      ) {
        return res.status(404).end();
      }

      const base =
        process.env.PUBLIC_BASE_URL ||
        `${req.protocol}://${req.get("host")}`;

      const target =
        `${base}/order/${encodeURIComponent(bench.token)}`;

      const buffer =
        await QRCode.toBuffer(
          target,
          {
            width: 900,
            margin: 2,
            errorCorrectionLevel: "H"
          }
        );

      res.type("png");
      res.setHeader(
        "Cache-Control",
        "public, max-age=86400"
      );

      res.send(buffer);

    } catch (error) {
      res.status(500).end();
    }
  }
);

app.get(
  "/api/public/menu/:token",
  publicOrderLimiter,
  async (req, res) => {
    try {
      const bench =
        await db.bench.findUnique({
          where: {
            token: String(req.params.token)
          },
          include: {
            branch: true
          }
        });

      if (
        !bench ||
        !bench.active ||
        !bench.branch.active
      ) {
        return res.status(404).json({
          error:
            "QR code is inactive"
        });
      }

      const menu =
        await db.menuItem.findMany({
          where: {
            branchId: bench.branchId,
            active: true
          },
          orderBy: [
            {
              sortOrder: "asc"
            },
            {
              category: "asc"
            },
            {
              name: "asc"
            }
          ]
        });

      res.json({
        branch: {
          id: bench.branch.id,
          name: bench.branch.name,
          code: bench.branch.code,
          logoUrl: bench.branch.logoUrl,
          upiId: bench.branch.upiId,
          upiName: bench.branch.upiName,
          taxEnabled:
            bench.branch.taxEnabled,
          taxRate:
            money(bench.branch.taxRate)
        },

        bench: {
          id: bench.id,
          label: bench.label,
          token: bench.token
        },

        menu:
          menu.map(item => ({
            id: item.id,
            name: item.name,
            category: item.category,
            description:
              item.description,
            price:
              money(item.price),
            taxRate:
              item.taxRate === null
                ? null
                : money(item.taxRate),
            soldOut:
              item.soldOut,
            imageUrl:
              item.imageUrl
          }))
      });

    } catch (error) {
      res.status(500).json({
        error:
          "Unable to load menu"
      });
    }
  }
);

/* ============================================================
   PUBLIC QR ORDER
   ============================================================ */

app.post(
  "/api/orders",
  publicOrderLimiter,
  async (req, res) => {
    try {
      if (
        req.body?.source !== "QR"
      ) {
        return res.status(400).json({
          error:
            "Only QR orders are accepted here"
        });
      }

      const branchId =
        String(
          req.body?.branchId || ""
        );

      const benchId =
        String(
          req.body?.benchId || ""
        );

      if (!branchId || !benchId) {
        return res.status(400).json({
          error:
            "QR branch and bench are required"
        });
      }

      const bench =
        await db.bench.findFirst({
          where: {
            id: benchId,
            branchId,
            active: true
          }
        });

      if (!bench) {
        return res.status(400).json({
          error:
            "Invalid QR location"
        });
      }

      const order =
        await createOrder({
          branchId,
          benchId,
          source: "QR",
          clientRequestId:
            req.body?.clientRequestId ||
            makeClientRequestId(),
          customerName:
            req.body?.customerName ||
            undefined,
          customerPhone:
            req.body?.customerPhone ||
            undefined,
          notes:
            req.body?.notes ||
            undefined,
          lines:
            Array.isArray(
              req.body?.lines
            )
              ? req.body.lines
              : []
        });

      await audit(
        "QR_ORDER_CREATED",
        "Order",
        order.id,
        {
          number: order.number,
          benchId,
          branchId
        },
        undefined,
        branchId
      );

      res.status(201).json({
        ok: true,
        order:
          publicOrder(order)
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

/* ============================================================
   AUTHENTICATED POS ORDERS
   ============================================================ */

app.get(
  "/api/pos/orders",
  requireAuth,
  async (req, res) => {
    try {
      const branchId =
        branchScope(req);

      if (!branchId) {
        return res.status(400).json({
          error:
            "A branch is required"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const status =
        req.query.status
          ? String(req.query.status)
          : undefined;

      const where: any = {
        branchId
      };

      if (
        status &&
        Object.values(OrderStatus)
          .includes(status as OrderStatus)
      ) {
        where.status =
          status as OrderStatus;
      }

      const orders =
        await db.order.findMany({
          where,
          include: {
            branch: true,
            bench: true,
            cashier: {
              select: {
                name: true
              }
            },
            lines: {
              include: {
                menuItem: true
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 200
        });

      res.json(
        orders.map(publicOrder)
      );

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

app.post(
  "/api/pos/orders",
  requireAuth,
  async (req, res) => {
    try {
      const session =
        (req as any).session;

      const requestedBranchId =
        String(
          req.body?.branchId ||
          session.branchId ||
          ""
        );

      if (!requestedBranchId) {
        return res.status(400).json({
          error:
            "Branch is required"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          requestedBranchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const benchId =
        req.body?.benchId
          ? String(
              req.body.benchId
            )
          : null;

      if (benchId) {
        await validateBench(
          requestedBranchId,
          benchId
        );
      }

      const order =
        await createOrder(
          {
            branchId:
              requestedBranchId,

            benchId,

            source: "POS",

            clientRequestId:
              req.body?.clientRequestId ||
              makeClientRequestId(),

            customerName:
              req.body?.customerName ||
              undefined,

            customerPhone:
              req.body?.customerPhone ||
              undefined,

            notes:
              req.body?.notes ||
              undefined,

            paymentMethod:
              req.body?.paymentMethod
                ? String(
                    req.body.paymentMethod
                  ) as PaymentMethod
                : undefined,

            discount:
              Number(
                req.body?.discount || 0
              ),

            lines:
              Array.isArray(
                req.body?.lines
              )
                ? req.body.lines
                : []
          },
          session.id
        );

      await audit(
        "POS_ORDER_CREATED",
        "Order",
        order.id,
        {
          number: order.number,
          branchId:
            requestedBranchId
        },
        session.id,
        requestedBranchId
      );

      res.status(201).json({
        ok: true,
        order:
          publicOrder(order)
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

/* ============================================================
   ORDER STATUS
   ============================================================ */

app.patch(
  "/api/orders/:id/status",
  requireAuth,
  async (req, res) => {
    try {
      const session =
        (req as any).session;

      const status =
        String(
          req.body?.status || ""
        ) as OrderStatus;

      if (
        !Object.values(
          OrderStatus
        ).includes(status)
      ) {
        return res.status(400).json({
          error:
            "Invalid order status"
        });
      }

      const existing =
        await db.order.findUnique({
          where: {
            id: String(req.params.id)
          }
        });

      if (!existing) {
        return res.status(404).json({
          error:
            "Order not found"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          existing.branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const updated =
        await db.order.update({
          where: {
            id: existing.id
          },
          data: {
            status
          },
          include: {
            branch: true,
            bench: true,
            cashier: {
              select: {
                name: true
              }
            },
            lines: {
              include: {
                menuItem: true
              }
            }
          }
        });

      await audit(
        "ORDER_STATUS_CHANGED",
        "Order",
        updated.id,
        {
          from:
            existing.status,
          to: status
        },
        session.id,
        updated.branchId
      );

      res.json({
        ok: true,
        order:
          publicOrder(updated)
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

/* ============================================================
   HELD BILLS
   ============================================================ */

app.get(
  "/api/held-bills",
  requireAuth,
  async (req, res) => {
    try {
      const branchId =
        branchScope(req);

      if (!branchId) {
        return res.status(400).json({
          error:
            "A branch is required"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const held =
        await db.heldBill.findMany({
          where: {
            branchId
          },
          include: {
            bench: true,
            cashier: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            updatedAt: "desc"
          },
          take: 100
        });

      res.json(
        held.map(item => ({
          id: item.id,
          customerName:
            item.customerName,
          customerPhone:
            item.customerPhone,
          notes: item.notes,
          subtotal:
            money(item.subtotal),
          discount:
            money(item.discount),
          tax:
            money(item.tax),
          total:
            money(item.total),
          locationType:
            item.locationType,
          customLocation:
            item.customLocation,
          payload:
            item.payload,
          bench: item.bench
            ? {
                id: item.bench.id,
                label: item.bench.label
              }
            : null,
          cashier:
            item.cashier
              ? {
                  name:
                    item.cashier.name
                }
              : null,
          createdAt:
            item.createdAt,
          updatedAt:
            item.updatedAt
        }))
      );

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

app.post(
  "/api/held-bills",
  requireAuth,
  async (req, res) => {
    try {
      const session =
        (req as any).session;

      const branchId =
        String(
          req.body?.branchId ||
          session.branchId ||
          ""
        );

      if (!branchId) {
        return res.status(400).json({
          error:
            "Branch is required"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const payload =
        req.body?.payload;

      if (
        !payload ||
        !Array.isArray(
          payload.lines
        ) ||
        payload.lines.length === 0
      ) {
        return res.status(400).json({
          error:
            "A held bill must contain items"
        });
      }

      const benchId =
        req.body?.benchId
          ? String(
              req.body.benchId
            )
          : null;

      if (benchId) {
        await validateBench(
          branchId,
          benchId
        );
      }

      const held =
        await db.heldBill.create({
          data: {
            customerName:
              req.body?.customerName ||
              undefined,

            customerPhone:
              req.body?.customerPhone ||
              undefined,

            notes:
              req.body?.notes ||
              undefined,

            subtotal:
              Number(
                req.body?.subtotal || 0
              ),

            discount:
              Number(
                req.body?.discount || 0
              ),

            tax:
              Number(
                req.body?.tax || 0
              ),

            total:
              Number(
                req.body?.total || 0
              ),

            locationType:
              req.body?.locationType ||
              "COUNTER",

            customLocation:
              req.body?.customLocation ||
              undefined,

            payload,

            branchId,

            benchId:
              benchId ||
              undefined,

            cashierId:
              session.id
          }
        });

      await audit(
        "BILL_HELD",
        "HeldBill",
        held.id,
        {},
        session.id,
        branchId
      );

      res.status(201).json({
        ok: true,
        heldBill: held
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

app.delete(
  "/api/held-bills/:id",
  requireAuth,
  async (req, res) => {
    try {
      const session =
        (req as any).session;

      const held =
        await db.heldBill.findUnique({
          where: {
            id: String(req.params.id)
          }
        });

      if (!held) {
        return res.status(404).json({
          error:
            "Held bill not found"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          held.branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      await db.heldBill.delete({
        where: {
          id: held.id
        }
      });

      await audit(
        "HELD_BILL_DELETED",
        "HeldBill",
        held.id,
        {},
        session.id,
        held.branchId
      );

      res.json({
        ok: true
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

/* ============================================================
   DAILY SALES
   ============================================================ */

app.get(
  "/api/reports/daily-sales",
  requireAuth,
  async (req, res) => {
    try {
      const requestedBranch =
        req.query.branchId
          ? String(
              req.query.branchId
            )
          : "";

      const branchId =
        requestedBranch ||
        branchScope(req);

      if (!branchId) {
        return res.status(400).json({
          error:
            "Branch is required"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const date =
        String(
          req.query.date ||
          new Date()
            .toISOString()
            .slice(0, 10)
        );

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          date
        )
      ) {
        return res.status(400).json({
          error:
            "Date must be YYYY-MM-DD"
        });
      }

      const start =
        new Date(
          `${date}T00:00:00+05:30`
        );

      const end =
        new Date(
          `${date}T23:59:59.999+05:30`
        );

      const orders =
        await db.order.findMany({
          where: {
            branchId,
            createdAt: {
              gte: start,
              lte: end
            },
            status: {
              not: "CANCELLED"
            }
          },
          include: {
            lines: {
              include: {
                menuItem: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        });

      const totalSales =
        roundMoney(
          orders.reduce(
            (sum, order) =>
              sum + money(order.total),
            0
          )
        );

      const cash =
        roundMoney(
          orders
            .filter(
              o =>
                o.paymentMethod ===
                "CASH"
            )
            .reduce(
              (sum, o) =>
                sum + money(o.total),
              0
            )
        );

      const upi =
        roundMoney(
          orders
            .filter(
              o =>
                o.paymentMethod ===
                "UPI"
            )
            .reduce(
              (sum, o) =>
                sum + money(o.total),
              0
            )
        );

      const card =
        roundMoney(
          orders
            .filter(
              o =>
                o.paymentMethod ===
                "CARD"
            )
            .reduce(
              (sum, o) =>
                sum + money(o.total),
              0
            )
        );

      const qrOrders =
        orders.filter(
          o =>
            o.source === "QR"
        ).length;

      const pending =
        orders.filter(
          o =>
            o.status === "PENDING"
        ).length;

      const itemMap =
        new Map<
          string,
          {
            name: string;
            quantity: number;
            amount: number;
          }
        >();

      for (const order of orders) {
        for (const line of order.lines) {
          const key =
            line.menuItemId;

          const existing =
            itemMap.get(key);

          if (existing) {
            existing.quantity +=
              line.quantity;

            existing.amount =
              roundMoney(
                existing.amount +
                money(line.lineTotal)
              );
          } else {
            itemMap.set(key, {
              name:
                line.menuItem.name,
              quantity:
                line.quantity,
              amount:
                money(line.lineTotal)
            });
          }
        }
      }

      res.json({
        date,
        branchId,
        totalSales,
        orders:
          orders.length,
        cash,
        upi,
        card,
        qrOrders,
        pending,
        items:
          [...itemMap.values()]
            .sort(
              (a, b) =>
                b.quantity -
                a.quantity
            )
      });

    } catch (error) {
      res.status(400).json({
        error: safeError(error)
      });
    }
  }
);

/* ============================================================
   RECEIPT PDF
   ============================================================ */

app.get(
  "/api/orders/:id/pdf",
  requireAuth,
  async (req, res) => {

    try {
      const order =
        await db.order.findUnique({
          where: {
            id: String(req.params.id)
          },
          include: {
            branch: true,
            bench: true,
            cashier: {
              select: {
                name: true
              }
            },
            lines: {
              include: {
                menuItem: true
              }
            }
          }
        });

      if (!order) {
        return res.status(404).json({
          error:
            "Order not found"
        });
      }

      if (
        !(await ensureBranchAccess(
          req,
          order.branchId
        ))
      ) {
        return res.status(403).json({
          error:
            "Branch access denied"
        });
      }

      const doc =
        new PDFDocument({
          size:
            order.branch.receiptPaperWidth === 58
              ? [164, 800]
              : [226, 1000],
          margin: 12
        });

      res.setHeader(
        "Content-Type",
        "application/pdf"
      );

      res.setHeader(
        "Content-Disposition",
        `inline; filename="${order.invoiceNumber || order.number}.pdf"`
      );

      doc.pipe(res);

      const center = (
        text: string,
        size = 9
      ) => {
        doc
          .fontSize(size)
          .text(
            text,
            {
              align: "center"
            }
          );
      };

      center(
        order.branch.name,
        13
      );

      if (order.branch.address) {
        center(
          order.branch.address
        );
      }

      if (order.branch.phone) {
        center(
          `Phone: ${order.branch.phone}`
        );
      }

      if (order.branch.gstin) {
        center(
          `GSTIN: ${order.branch.gstin}`
        );
      }

      center(
        order.branch.invoiceTitle ||
        "TAX INVOICE",
        11
      );

      doc.moveDown(0.4);

      doc.fontSize(9);

      doc.text(
        `Bill No: ${order.invoiceNumber || order.number}`
      );

      doc.text(
        `Date: ${new Date(order.createdAt).toLocaleString("en-IN")}`
      );

      doc.text(
        `Cashier: ${order.cashier?.name || "-"}`
      );

      doc.text(
        `Payment: ${order.paymentMethod || "UNPAID"}`
      );

      doc.text(
        `Location: ${
          order.bench?.label ||
          "Counter"
        }`
      );

      if (order.customerName) {
        doc.text(
          `Customer: ${order.customerName}`
        );
      }

      if (order.customerPhone) {
        doc.text(
          `Phone: ${order.customerPhone}`
        );
      }

      doc.moveDown(0.4);

      doc.text(
        "--------------------------------"
      );

      for (const line of order.lines) {
        const name =
          line.menuItem.name;

        const qty =
          line.quantity;

        const amount =
          money(line.lineTotal)
            .toFixed(2);

        doc.text(
          `${name}`
        );

        doc.text(
          `${qty} x ₹${money(line.unitPrice).toFixed(2)}     ₹${amount}`
        );
      }

      doc.text(
        "--------------------------------"
      );

      doc.text(
        `Subtotal: ₹${money(order.subtotal).toFixed(2)}`
      );

      if (money(order.discount) > 0) {
        doc.text(
          `Discount: ₹${money(order.discount).toFixed(2)}`
        );
      }

      if (money(order.tax) > 0) {
        doc.text(
          `Tax: ₹${money(order.tax).toFixed(2)}`
        );
      }

      doc
        .fontSize(12)
        .text(
          `TOTAL: ₹${money(order.total).toFixed(2)}`
        );

      doc.moveDown(0.5);

      if (order.branch.receiptFooter) {
        center(
          order.branch.receiptFooter
        );
      }

      center(
        "Thank you. Visit again!"
      );

      doc.end();

    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          error:
            safeError(error)
        });
      }
    }
  }
);

/* ============================================================
   STATIC FILES
   ============================================================ */

app.use(
  express.static(
    publicDir,
    {
      index: false,
      etag: false,
      maxAge: IS_NETLIFY
        ? "1h"
        : 0
    }
  )
);

/*
 * IMPORTANT:
 * No duplicate login route.
 * POS always starts at one clean login page.
 */

app.get(
  "/",
  (_req, res) => {
    res.sendFile(
      path.join(
        publicDir,
        "pos",
        "index.html"
      )
    );
  }
);

app.get(
  "/pos",
  (_req, res) => {
    res.sendFile(
      path.join(
        publicDir,
        "pos",
        "index.html"
      )
    );
  }
);

app.get(
  "/pos/",
  (_req, res) => {
    res.sendFile(
      path.join(
        publicDir,
        "pos",
        "index.html"
      )
    );
  }
);

app.get(
  "/admin",
  (_req, res) => {
    res.sendFile(
      path.join(
        publicDir,
        "admin",
        "index.html"
      )
    );
  }
);

app.get(
  "/admin/*splat",
  (_req, res) => {
    res.sendFile(
      path.join(
        publicDir,
        "admin",
        "index.html"
      )
    );
  }
);

app.get(
  "/kds",
  (_req, res) => {
    res.sendFile(
      path.join(
        publicDir,
        "kds",
        "index.html"
      )
    );
  }
);

app.get(
  "/kds/*splat",
  (_req, res) => {
    res.sendFile(
      path.join(
        publicDir,
        "kds",
        "index.html"
      )
    );
  }
);

app.get(
  "/order/:token",
  (_req, res) => {
    res.sendFile(
      path.join(
        publicDir,
        "customer",
        "index.html"
      )
    );
  }
);

app.get(
  "/order/*splat",
  (_req, res) => {
    res.sendFile(
      path.join(
        publicDir,
        "customer",
        "index.html"
      )
    );
  }
);

app.use(
  (
    _req,
    res
  ) => {
    res.status(404).json({
      error:
        "Not found"
    });
  }
);

/* ============================================================
   SERVER
   ============================================================ */

const server =
  http.createServer(app);

/*
 * Socket.IO is intentionally not relied upon
 * for Netlify production because Netlify functions
 * are request-based. Frontends use short polling
 * there. Local/server deployment can still use the
 * HTTP API safely.
 */

if (!IS_NETLIFY) {
  try {
    const { Server } =
      require("socket.io");

    const io =
      new Server(server, {
        cors: {
          origin: true,
          credentials: true
        }
      });

    io.on(
      "connection",
      (socket: any) => {

        socket.on(
          "branch:join",
          (branchId: string) => {
            if (
              typeof branchId ===
                "string" &&
              branchId.length > 0
            ) {
              socket.join(
                `branch:${branchId}`
              );
            }
          }
        );
      }
    );

    (app as any).io = io;

  } catch {
    // HTTP polling remains available.
  }
}

async function shutdown() {
  try {
    await db.$disconnect();
  } finally {
    process.exit(0);
  }
}

process.on(
  "SIGINT",
  shutdown
);

process.on(
  "SIGTERM",
  shutdown
);

if (
  require.main === module
) {
  server.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `Sri Ganapathy Andhra's Ruchulu POS running on ${PORT}`
      );
    }
  );
}

export {
  app,
  server
};