import "dotenv/config";
import express from "express";
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import http from "http";
import path from "path";
import { z } from "zod";
import QRCode from "qrcode";
import { db } from "./db.js";
import { login,setSession,clearSession,requireAuth,requireAdmin,requireSuperAdmin,branchScope,hashPassword } from "./auth.js";
import { initRealtime,emitBranch,emitOrder } from "./realtime.js";
import { receiptPdf } from "./pdf.js";
const publicDir = path.resolve(process.cwd(), "public");
const app = express(); const server=http.createServer(app);
/*
 * ================================================================
 * SGAR AUTHENTICATION ENTRY ROUTES
 * These routes MUST exist before the final catch-all route.
 * ================================================================
 */







app.use(helmet({contentSecurityPolicy:false}));
app.use(cors({origin:true,credentials:true}));
app.use(compression());
app.use(express.json({limit:"2mb"}));
app.use(cookieParser());
const loginLimiter=rateLimit({windowMs:15*60*1000,max:20,standardHeaders:true,legacyHeaders:false});
const publicOrderLimiter=rateLimit({windowMs:60*1000,max:30,standardHeaders:true,legacyHeaders:false});
app.get("/health",(_,res)=>res.json({ok:true,time:new Date().toISOString(),service:"sri-ganapathy-andhras-ruchulu-pos"}));

const branchInput=z.object({name:z.string().min(2).max(100),code:z.string().min(2).max(16).regex(/^[A-Za-z0-9_-]+$/),slug:z.string().min(2).max(100).regex(/^[a-z0-9-]+$/).optional(),address:z.string().max(250).optional(),phone:z.string().max(30).optional(),gstin:z.string().max(20).optional(),salesUsername:z.string().min(3).max(50),salesPassword:z.string().min(8).max(100),benchCount:z.number().int().min(1).max(500).default(20)});
const settingsInput=z.object({name:z.string().min(2).max(100).optional(),address:z.string().max(250).nullable().optional(),phone:z.string().max(30).nullable().optional(),gstin:z.string().max(20).nullable().optional(),invoicePrefix:z.string().min(1).max(12).optional(),receiptHeader:z.string().max(500).nullable().optional(),receiptFooter:z.string().max(500).nullable().optional(),logoUrl:z.string().max(500).nullable().optional(),invoiceTitle:z.string().max(100).optional(),receiptPaperWidth:z.number().int().refine(v=>v===58||v===80).optional(),timezone:z.string().max(80).optional(),currency:z.string().max(10).optional(),taxEnabled:z.boolean().optional(),taxRate:z.number().min(0).max(100).optional(),upiId:z.string().max(120).nullable().optional(),upiName:z.string().max(120).nullable().optional(),paymentCashEnabled:z.boolean().optional(),paymentUpiEnabled:z.boolean().optional(),paymentCardEnabled:z.boolean().optional(),active:z.boolean().optional()});
function slugify(s:string){return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");}
function baseUrl(){return (process.env.PUBLIC_BASE_URL||`http://localhost:${process.env.PORT||4000}`).replace(/\/$/,"");}

app.post(
  "/api/auth/login",
  loginLimiter,
  async (req, res) => {
    try {
      const body = req.body || {};

      const username =
        typeof body.username === "string"
          ? body.username.trim()
          : "";

      const password =
        typeof body.password === "string"
          ? body.password
          : "";

      const branchId =
        typeof body.branchId === "string" &&
        body.branchId.trim()
          ? body.branchId.trim()
          : undefined;

      if (!username || !password) {
        return res.status(400).json({
          error: "Username and password are required"
        });
      }

      const result =
        await login(
          username,
          password,
          branchId
        );

      if (!result) {
        return res.status(401).json({
          error: "Invalid username or password"
        });
      }

      setSession(
        res,
        result.token
      );

      return res.status(200).json({
        ok: true,
        user: result.user
      });

    } catch (error) {
      console.error(
        "LOGIN_ERROR:",
        error
      );

      return res.status(500).json({
        error: "Login service error"
      });
    }
  }
);
app.post("/api/auth/logout",(req,res)=>{clearSession(res);res.json({ok:true});});
app.get("/api/me",requireAuth,async(req,res)=>{
  const s=(req as any).session;

  const user=await db.user.findUnique({
    where:{id:s.userId},
    select:{
      id:true,
      name:true,
      username:true,
      role:true,
      active:true,
      branchId:true,
      createdAt:true,
      updatedAt:true,
      branch:true
    }
  });

  if(!user){
    return res.status(404).json({
      error:"User not found"
    });
  }

  res.json({user});
});
app.patch("/api/branches/:id",requireAuth,requireSuperAdmin,async(req,res)=>{const p=settingsInput.safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid settings"});const b=await db.branch.update({where:{id:String(req.params.id)},data:{...p.data,taxRate:p.data.taxRate}});res.json(b);});
app.get("/api/branches/:id/settings",requireAuth,requireAdmin,async(req,res)=>{const b=await db.branch.findUnique({where:{id:String(req.params.id)}});if(!b)return res.status(404).json({error:"Branch not found"});const s=(req as any).session;if(s.role!=="SUPER_ADMIN"&&s.branchId!==b.id)return res.status(403).json({error:"Branch access denied"});res.json(b);});

const menuInput=z.object({name:z.string().min(1).max(100),category:z.string().min(1).max(60),description:z.string().max(300).optional(),barcode:z.string().max(80).nullable().optional(),hsnCode:z.string().max(20).nullable().optional(),taxRate:z.number().min(0).max(100).nullable().optional(),price:z.number().nonnegative(),active:z.boolean().default(true),sortOrder:z.number().int().default(0),imageUrl:z.string().url().nullable().optional()});
app.get("/api/menu",requireAuth,async(req,res)=>{const branchId=branchScope(req);if(!branchId)return res.status(400).json({error:"branchId required"});res.json(await db.menuItem.findMany({where:{branchId},orderBy:[{sortOrder:"asc"},{category:"asc"},{name:"asc"}] }));});
app.post("/api/menu",requireAuth,requireAdmin,async(req,res)=>{const branchId=branchScope(req);if(!branchId)return res.status(400).json({error:"branchId required"});const p=menuInput.safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid menu item"});try{res.status(201).json(await db.menuItem.create({data:{...p.data,branchId,price:p.data.price,taxRate:p.data.taxRate}}));}catch(e){res.status(409).json({error:"Barcode already exists in this branch"});}});
app.patch("/api/menu/:id",requireAuth,requireAdmin,async(req,res)=>{const p=menuInput.partial().safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid menu item"});const s=(req as any).session;const item=await db.menuItem.findUnique({where:{id:String(req.params.id)}});if(!item)return res.status(404).json({error:"Menu item not found"});if(s.role!=="SUPER_ADMIN"&&s.branchId!==item.branchId)return res.status(403).json({error:"Branch access denied"});res.json(await db.menuItem.update({where:{id:item.id},data:p.data}));});
app.get("/api/menu/barcode/:barcode",requireAuth,async(req,res)=>{const branchId=branchScope(req);if(!branchId)return res.status(400).json({error:"branchId required"});const item=await db.menuItem.findFirst({where:{branchId,barcode:String(req.params.barcode),active:true}});if(!item)return res.status(404).json({error:"Item not found"});res.json(item);});

app.get("/api/benches",requireAuth,async(req,res)=>{const branchId=branchScope(req);if(!branchId)return res.status(400).json({error:"branchId required"});res.json(await db.bench.findMany({where:{branchId},orderBy:{label:"asc"}}));});
app.post("/api/benches",requireAuth,requireAdmin,async(req,res)=>{const branchId=branchScope(req);if(!branchId)return res.status(400).json({error:"branchId required"});const p=z.object({label:z.string().min(1).max(50)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid bench"});const b=await db.bench.create({data:{label:p.data.label,token:`${branchId}-${crypto.randomUUID()}`,branchId}});res.status(201).json({...b,qrUrl:`${baseUrl()}/api/qr/${encodeURIComponent(b.token)}.png`,orderUrl:`${baseUrl()}/order/${encodeURIComponent(b.token)}`});});
app.get("/api/benches/:id/qr.png",requireAuth,async(req,res)=>{const b=await db.bench.findUnique({where:{id:String(req.params.id)}});if(!b)return res.status(404).end();const s=(req as any).session;if(s.role!=="SUPER_ADMIN"&&s.branchId!==b.branchId)return res.status(403).end();const png=await QRCode.toBuffer(`${baseUrl()}/order/${encodeURIComponent(b.token)}`,{width:1000,margin:2,errorCorrectionLevel:"H"});res.type("png").send(png);});
app.get("/api/branches/:id/qr-sheet.png",requireAuth,requireSuperAdmin,async(req,res)=>{
  const b=await db.branch.findUnique({where:{id:String(req.params.id)},include:{benches:{where:{active:true},orderBy:{label:"asc"}}}});if(!b)return res.status(404).end();
  const cells=await Promise.all(b.benches.map(async bench=>({bench,buffer:await QRCode.toBuffer(`${baseUrl()}/order/${encodeURIComponent(bench.token)}`,{width:700,margin:2,errorCorrectionLevel:"H"})})));
  res.status(501).json({error:"Use the individual QR PNG endpoint for production printing; a vector/PDF sheet should be generated by the deployment-specific print module."});
});
app.get("/api/qr/:token.png",async(req,res)=>{const b=await db.bench.findUnique({where:{token:req.params.token}});if(!b||!b.active)return res.status(404).end();const png=await QRCode.toBuffer(`${baseUrl()}/order/${encodeURIComponent(b.token)}`,{width:1000,margin:2,errorCorrectionLevel:"H"});res.type("png").send(png);});

app.get("/api/public/menu/:token",async(req,res)=>{
  const b=await db.bench.findUnique({where:{token:req.params.token},include:{branch:true}});
  if(!b||!b.active||!b.branch.active)return res.status(404).json({error:"QR code is inactive"});
  const menu=await db.menuItem.findMany({where:{branchId:b.branchId,active:true},orderBy:[{sortOrder:"asc"},{category:"asc"},{name:"asc"}]});
  res.json({branch:{id:b.branch.id,name:b.branch.name,code:b.branch.code,phone:b.branch.phone,address:b.branch.address,slug:b.branch.slug,upiId:b.branch.upiId,upiName:b.branch.upiName,paymentUpiEnabled:b.branch.paymentUpiEnabled},bench:{id:b.id,label:b.label,token:b.token},menu});
});
app.get("/api/public/payment-qr/:branchId.png",async(req,res)=>{
  const b=await db.branch.findUnique({where:{id:req.params.branchId}});if(!b||!b.active||!b.upiId)return res.status(404).end();
  const amount=typeof req.query.amount==="string"?req.query.amount:"";
  const uri=`upi://pay?pa=${encodeURIComponent(b.upiId)}&pn=${encodeURIComponent(b.upiName||b.name)}${amount?`&am=${encodeURIComponent(amount)}&cu=INR`:""}`;
  const png=await QRCode.toBuffer(uri,{width:700,margin:2,errorCorrectionLevel:"H"});res.type("png").send(png);
});
app.get("/api/public/orders/:id",async(req,res)=>{
  const o=await db.order.findUnique({where:{id:String(req.params.id)},include:{branch:true,bench:true,cashier:{select:{name:true}},lines:{include:{menuItem:true}}}});
  if(!o)return res.status(404).json({error:"Order not found"});
  res.json({id:o.id,number:o.number,status:o.status,total:o.total,branch:o.branch.name,bench:o.bench?.label,lines:o.lines});
});

const orderSchema=z.object({branchId:z.string().optional(),benchId:z.string().optional(),source:z.enum(["POS","QR"]),clientRequestId:z.string().max(100).optional(),customerName:z.string().max(80).optional(),notes:z.string().max(500).optional(),paymentMethod:z.enum(["CASH","UPI","CARD","CREDIT"]).optional(),discount:z.number().min(0).default(0),lines:z.array(z.object({menuItemId:z.string(),quantity:z.number().int().positive()})).min(1)});
async function createOrder(data:any,cashierId?:string){
  if(data.clientRequestId){const existing=await db.order.findUnique({where:{clientRequestId:data.clientRequestId},include:{branch:true,bench:true,cashier:{select:{name:true}},lines:{include:{menuItem:true}}}});if(existing)return existing;}
  return db.$transaction(async tx=>{
    const branch=await tx.branch.findUnique({where:{id:data.branchId}});if(!branch||!branch.active)throw new Error("Branch not found or inactive");
    if(data.benchId){const bench=await tx.bench.findFirst({where:{id:data.benchId,branchId:data.branchId,active:true}});if(!bench)throw new Error("Invalid bench");}
    const ids=data.lines.map((x:any)=>x.menuItemId);const products=await tx.menuItem.findMany({where:{id:{in:ids},branchId:data.branchId,active:true}});const map=new Map(products.map(p=>[p.id,p]));if(products.length!==new Set(ids).size)throw new Error("Invalid menu item");
    const lines=data.lines.map((x:any)=>{const p=map.get(x.menuItemId)!;return {menuItemId:p.id,quantity:x.quantity,unitPrice:p.price,lineTotal:Number(p.price)*x.quantity};});
    const subtotal=lines.reduce((a:number,x:any)=>a+x.lineTotal,0);const discount=Math.min(data.discount||0,subtotal);const taxable=subtotal-discount;const tax=branch.taxEnabled?taxable*Number(branch.taxRate):0;const total=taxable+tax;
    const seqRow=await tx.branch.update({where:{id:data.branchId},data:{nextInvoiceNumber:{increment:1}},select:{nextInvoiceNumber:true}});const number=seqRow.nextInvoiceNumber-1;const invoiceNumber=`${branch.invoicePrefix}-${new Date().getFullYear()}-${String(number).padStart(6,"0")}`;
    return tx.order.create({data:{number,invoiceNumber,clientRequestId:data.clientRequestId,source:data.source,status:data.source==="QR"?"PENDING":"ACCEPTED",paymentMethod:data.paymentMethod,paymentStatus:data.paymentMethod?"PAID":"UNPAID",customerName:data.customerName,notes:data.notes,subtotal,discount,tax,total,branchId:data.branchId,benchId:data.benchId,cashierId,lines:{create:lines}},include:{branch:true,bench:true,cashier:{select:{name:true}},lines:{include:{menuItem:true}}}});
  });
}
app.post("/api/orders",publicOrderLimiter,async(req,res)=>{const p=orderSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0]?.message||"Invalid order"});if(p.data.source!=="QR")return res.status(400).json({error:"Public endpoint accepts QR orders only"});try{const o=await createOrder(p.data);emitBranch(o.branchId,"order:new",o);res.status(201).json({id:o.id,number:o.number,status:o.status,branch:o.branch,bench:o.bench,total:o.total});}catch(e:any){res.status(400).json({error:e.message});}});
app.post("/api/pos/orders",requireAuth,async(req,res)=>{const s=(req as any).session;const body={...req.body,branchId:s.branchId||req.body.branchId,source:"POS"};if(!body.branchId)return res.status(400).json({error:"No branch assigned"});if(s.role!=="SUPER_ADMIN"&&s.role!=="ADMIN"&&body.branchId!==s.branchId)return res.status(403).json({error:"Branch access denied"});const p=orderSchema.safeParse(body);if(!p.success)return res.status(400).json({error:p.error.issues[0]?.message||"Invalid order"});try{const o=await createOrder(p.data,s.userId);await db.auditLog.create({data:{action:"CREATE_ORDER",entity:"Order",entityId:o.id,userId:s.userId,branchId:o.branchId,metadata:{source:o.source,total:Number(o.total)}}});emitBranch(o.branchId,"order:new",o);res.status(201).json(o);}catch(e:any){res.status(400).json({error:e.message});}});
app.get("/api/orders",requireAuth,async(req,res)=>{const branchId=branchScope(req);if(!branchId)return res.status(400).json({error:"branchId required"});const status=typeof req.query.status==="string"?req.query.status:undefined;res.json(await db.order.findMany({where:{branchId,...(status?{status:status as any}:{})},include:{branch:true,bench:true,lines:{include:{menuItem:true}},cashier:{select:{name:true}}},orderBy:{createdAt:"desc"},take:200}));});
app.get("/api/orders/:id",requireAuth,async(req,res)=>{const o=await db.order.findUnique({where:{id:String(req.params.id)},include:{branch:true,bench:true,lines:{include:{menuItem:true}},cashier:{select:{name:true}}}});if(!o)return res.status(404).json({error:"Order not found"});const s=(req as any).session;if(s.role!=="SUPER_ADMIN"&&s.role!=="ADMIN"&&o.branchId!==s.branchId)return res.status(403).json({error:"Branch access denied"});res.json(o);});
app.patch("/api/orders/:id/status",requireAuth,async(req,res)=>{const p=z.object({status:z.enum(["PENDING","ACCEPTED","PREPARING","READY","SERVED","COMPLETED","CANCELLED"])}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid status"});const s=(req as any).session;const o=await db.order.findUnique({where:{id:String(req.params.id)}});if(!o)return res.status(404).json({error:"Order not found"});if(s.role!=="SUPER_ADMIN"&&s.role!=="ADMIN"&&o.branchId!==s.branchId)return res.status(403).json({error:"Branch access denied"});const updated=await db.order.update({where:{id:o.id},data:{status:p.data.status},include:{branch:true,bench:true,cashier:{select:{name:true}},lines:{include:{menuItem:true}}}});if(p.data.status==="PREPARING"){const printers=await db.printer.findMany({where:{branchId:o.branchId,active:true,kotOn:true}});for(const printer of printers)await db.printJob.create({data:{type:"KOT",branchId:o.branchId,orderId:o.id,printerId:printer.id}});}await db.auditLog.create({data:{action:"UPDATE_ORDER_STATUS",entity:"Order",entityId:o.id,userId:s.userId,branchId:o.branchId,metadata:{status:p.data.status}}});emitBranch(updated.branchId,"order:update",updated);emitOrder(updated.id,"order:update",updated);res.json(updated);});
app.get("/api/orders/:id/pdf",requireAuth,async(req,res)=>{const o=await db.order.findUnique({where:{id:String(req.params.id)},include:{branch:true,bench:true,cashier:{select:{name:true}},lines:{include:{menuItem:true}}}});if(!o)return res.status(404).json({error:"Order not found"});const s=(req as any).session;if(s.role!=="SUPER_ADMIN"&&s.role!=="ADMIN"&&o.branchId!==s.branchId)return res.status(403).json({error:"Branch access denied"});await receiptPdf(res,o);});

/*
 * SGAR PRODUCTION DAILY SALES REPORT
 *
 * Important:
 * - Branch scoped
 * - Date scoped
 * - Does NOT send all historical orders to browser
 * - PDFs are not stored
 * - Images are not stored
 * - Only compact report JSON is returned
 */
app.get(
  "/api/reports/daily-sales",
  requireAuth,
  async (req, res) => {

    try {

      const s = (req as any).session;

      const requestedBranchId =
        typeof req.query.branchId === "string"
          ? req.query.branchId.trim()
          : "";

      const date =
        typeof req.query.date === "string"
          ? req.query.date.trim()
          : "";

      /*
       * Normal branch users can NEVER choose another branch.
       * SUPER_ADMIN / ADMIN can request a specific branch.
       */
      const branchId =
        s.role === "SUPER_ADMIN" || s.role === "ADMIN"
          ? requestedBranchId || s.branchId
          : s.branchId;

      if (!branchId) {
        return res.status(400).json({
          error: "branchId required"
        });
      }

      if (
        s.role !== "SUPER_ADMIN" &&
        s.role !== "ADMIN" &&
        branchId !== s.branchId
      ) {
        return res.status(403).json({
          error: "Branch access denied"
        });
      }

      const branch =
        await db.branch.findUnique({
          where: {
            id: branchId
          },
          select: {
            id: true,
            name: true,
            code: true,
            timezone: true,
            active: true
          }
        });

      if (!branch || !branch.active) {
        return res.status(404).json({
          error: "Branch not found"
        });
      }

      /*
       * India-first POS.
       * If branch timezone is configured, use it for display.
       *
       * The date supplied by UI is YYYY-MM-DD.
       */
      const reportDate =
        /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? date
          : new Intl.DateTimeFormat(
              "en-CA",
              {
                timeZone:
                  branch.timezone ||
                  "Asia/Kolkata"
              }
            ).format(new Date());

      /*
       * Convert local India date into UTC boundaries.
       * This avoids using the browser's timezone.
       */
      const start =
        new Date(`${reportDate}T00:00:00+05:30`);

      const end =
        new Date(`${reportDate}T23:59:59.999+05:30`);

      /*
       * Only completed/valid sales.
       * Cancelled bills are excluded.
       *
       * We select only fields required for aggregation.
       * The browser never receives the raw order dataset.
       */
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

          select: {
            id: true,
            total: true,
            paymentMethod: true,
            source: true,

            lines: {
              select: {
                quantity: true,
                unitPrice: true,
                lineTotal: true,

                menuItem: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        });

      let sales = 0;

      let bills = 0;

      let qrOrders = 0;

      let cash = 0;
      let upi = 0;
      let card = 0;
      let credit = 0;

      const itemMap =
        new Map<
          string,
          {
            quantity: number;
            sales: number;
          }
        >();

      for (const order of orders) {

        bills += 1;

        sales += Number(order.total || 0);

        if (order.source === "QR") {
          qrOrders += 1;
        }

        const payment =
          order.paymentMethod;

        const amount =
          Number(order.total || 0);

        if (payment === "CASH") {
          cash += amount;
        }

        if (payment === "UPI") {
          upi += amount;
        }

        if (payment === "CARD") {
          card += amount;
        }

        if (payment === "CREDIT") {
          credit += amount;
        }

        for (const line of order.lines) {

          const itemName =
            line.menuItem?.name ||
            "Unknown Item";

          const current =
            itemMap.get(itemName) || {
              quantity: 0,
              sales: 0
            };

          current.quantity +=
            Number(line.quantity || 0);

          current.sales +=
            Number(line.lineTotal || 0);

          itemMap.set(
            itemName,
            current
          );
        }
      }

      const items =
        Array.from(itemMap.entries())
          .map(
            ([name, value]) => ({
              name,
              quantity: value.quantity,
              sales: Number(
                value.sales.toFixed(2)
              )
            })
          )
          .sort(
            (a, b) =>
              b.quantity - a.quantity
          );

      return res.json({
        branch: {
          id: branch.id,
          name: branch.name,
          code: branch.code
        },

        date: reportDate,

        summary: {
          sales: Number(
            sales.toFixed(2)
          ),

          bills,

          qrOrders,

          averageBill:
            bills > 0
              ? Number(
                  (sales / bills).toFixed(2)
                )
              : 0
        },

        payments: {
          cash: Number(cash.toFixed(2)),
          upi: Number(upi.toFixed(2)),
          card: Number(card.toFixed(2)),
          credit: Number(credit.toFixed(2))
        },

        items
      });

    } catch (error) {

      console.error(
        "DAILY_SALES_REPORT_ERROR:",
        error
      );

      return res.status(500).json({
        error: "Daily sales report failed"
      });
    }
  }
);
app.get("/api/dashboard",requireAuth,async(req,res)=>{const s=(req as any).session;const branchId=branchScope(req);if(!branchId)return res.status(400).json({error:"branchId required"});const start=new Date();start.setHours(0,0,0,0);const [sales,expenses,pending,qr]=await Promise.all([db.order.aggregate({where:{branchId,createdAt:{gte:start},status:{not:"CANCELLED"}},_sum:{total:true},_count:true}),db.expense.aggregate({where:{branchId,createdAt:{gte:start}},_sum:{amount:true}}),db.order.count({where:{branchId,status:{in:["PENDING","PREPARING","READY"]}}}),db.order.count({where:{branchId,source:"QR",createdAt:{gte:start}}})]);res.json({sales:Number(sales._sum.total||0),orders:sales._count,expenses:Number(expenses._sum.amount||0),pending,qrOrders:qr});});
app.get("/api/dashboard/all",requireAuth,requireAdmin,async(req,res)=>{const branches=await db.branch.findMany({where:{active:true},orderBy:{name:"asc"}});const rows=await Promise.all(branches.map(async b=>{const d=await (await fetch(`${baseUrl()}/api/dashboard?branchId=${b.id}`,{headers:{cookie:req.headers.cookie||""}})).json().catch(()=>null);return {branch:b,...d};}));res.json(rows);});
app.post("/api/expenses",requireAuth,async(req,res)=>{const s=(req as any).session;const branchId=s.branchId||req.body.branchId;if(!branchId)return res.status(400).json({error:"branchId required"});if(s.role!=="SUPER_ADMIN"&&s.role!=="ADMIN"&&branchId!==s.branchId)return res.status(403).json({error:"Branch access denied"});const p=z.object({title:z.string().min(1),category:z.string().min(1),amount:z.number().positive()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid expense"});res.status(201).json(await db.expense.create({data:{...p.data,branchId}}));});

app.get("/api/expenses",requireAuth,async(req,res)=>{
  const branchId=branchScope(req);
  if(!branchId)return res.status(400).json({error:"branchId required"});
  res.json(await db.expense.findMany({
    where:{branchId},
    orderBy:{createdAt:"desc"},
    take:200
  }));
});
app.get("/api/users",requireAuth,requireAdmin,async(req,res)=>{
  const s=(req as any).session;const where=s.role==="SUPER_ADMIN"||s.role==="ADMIN"?{}:{branchId:s.branchId};
  res.json(await db.user.findMany({where,select:{id:true,name:true,username:true,role:true,active:true,branchId:true,branch:true},orderBy:{name:"asc"}}));
});
app.post("/api/users",requireAuth,requireAdmin,async(req,res)=>{
  const s=(req as any).session;const p=z.object({name:z.string().min(2).max(100),username:z.string().min(3).max(50),password:z.string().min(8).max(100),role:z.enum(["ADMIN","MANAGER","CASHIER","KITCHEN"]),branchId:z.string().nullable().optional()}).safeParse(req.body);
  if(!p.success)return res.status(400).json({error:"Invalid user"});
  if(s.role!=="SUPER_ADMIN"&&p.data.branchId!==s.branchId)return res.status(403).json({error:"Branch access denied"});
  try{const u=await db.user.create({data:{name:p.data.name,username:p.data.username,passwordHash:await hashPassword(p.data.password),role:p.data.role as any,branchId:p.data.branchId||s.branchId}});res.status(201).json({id:u.id,name:u.name,username:u.username,role:u.role,branchId:u.branchId});}catch{res.status(409).json({error:"Username already exists"});}
});
app.patch("/api/users/:id/password",requireAuth,requireAdmin,async(req,res)=>{
  const s=(req as any).session;const p=z.object({password:z.string().min(8).max(100)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Password must be at least 8 characters"});
  const u=await db.user.findUnique({where:{id:String(req.params.id)}});if(!u)return res.status(404).json({error:"User not found"});if(s.role!=="SUPER_ADMIN"&&u.branchId!==s.branchId)return res.status(403).json({error:"Branch access denied"});
  await db.user.update({where:{id:u.id},data:{passwordHash:await hashPassword(p.data.password)}});res.json({ok:true});
});

app.post("/api/printers",requireAuth,requireAdmin,async(req,res)=>{const s=(req as any).session;const branchId=s.role==="SUPER_ADMIN"?req.body.branchId:s.branchId;if(!branchId)return res.status(400).json({error:"branchId required"});const p=z.object({name:z.string().min(1),type:z.string(),connection:z.string(),host:z.string().optional(),port:z.number().int().optional(),paperWidth:z.number().int().refine(v=>v===58||v===80),copies:z.number().int().min(1).max(3).default(1),receiptOn:z.boolean().default(true),kotOn:z.boolean().default(true)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid printer"});const printer=await db.printer.create({data:{...p.data,branchId,agentToken:crypto.randomUUID()}});res.status(201).json(printer);});
app.get("/api/printers",requireAuth,async(req,res)=>{const branchId=branchScope(req);if(!branchId)return res.status(400).json({error:"branchId required"});res.json(await db.printer.findMany({where:{branchId},orderBy:{name:"asc"}}));});
app.post("/api/print-jobs",requireAuth,async(req,res)=>{const s=(req as any).session;const p=z.object({orderId:z.string(),type:z.enum(["RECEIPT","KOT"]),printerId:z.string().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid print job"});const o=await db.order.findUnique({where:{id:p.data.orderId}});if(!o)return res.status(404).json({error:"Order not found"});if(s.role!=="SUPER_ADMIN"&&s.role!=="ADMIN"&&o.branchId!==s.branchId)return res.status(403).json({error:"Branch access denied"});const job=await db.printJob.create({data:{type:p.data.type,branchId:o.branchId,orderId:o.id,printerId:p.data.printerId}});emitBranch(o.branchId,"print:job",job);res.status(201).json(job);});


app.get("/api/printer-agent/jobs",async(req,res)=>{const token=String(req.query.agentToken||"");if(!token)return res.status(401).json({error:"Agent token required"});const printer=await db.printer.findUnique({where:{agentToken:token}});if(!printer||!printer.active)return res.status(401).json({error:"Printer agent not authorized"});const job=await db.printJob.findFirst({where:{branchId:printer.branchId,status:"QUEUED",OR:[{printerId:printer.id},{printerId:null}]},include:{order:{include:{branch:true,bench:true,cashier:{select:{name:true}},lines:{include:{menuItem:true}}}}},orderBy:{createdAt:"asc"}});if(!job)return res.json({job:null});await db.printJob.update({where:{id:job.id},data:{status:"PRINTING",attempts:{increment:1},printerId:printer.id}});res.json({job});});
app.post("/api/printer-agent/jobs/:id",async(req,res)=>{const token=String(req.query.agentToken||"");const printer=await db.printer.findUnique({where:{agentToken:token}});if(!printer)return res.status(401).json({error:"Printer agent not authorized"});const p=z.object({status:z.enum(["PRINTED","FAILED"]),error:z.string().max(500).optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid status"});const job=await db.printJob.findFirst({where:{id:String(req.params.id),printerId:printer.id}});if(!job)return res.status(404).json({error:"Print job not found"});res.json(await db.printJob.update({where:{id:job.id},data:{status:p.data.status as any,error:p.data.error}}));});

/*
 * ============================================================
 * SRI GANAPATHY ANDHRA'S RUCHULU
 * POS FRONTEND ROUTING
 * ============================================================
 *
 * IMPORTANT:
 * These routes are intentionally before express.static()
 * and before the final wildcard route.
 *
 * This prevents Express 5 wildcard routing from returning
 * the login page for dashboard.html.
 * ============================================================
 */

function noCache(res:any){
    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    );
    res.setHeader("Pragma","no-cache");
    res.setHeader("Expires","0");
}












/* SGAR_FINAL_LOGIN_CACHE_HEADERS */

app.use((req,res,next)=>{

  const p = req.path || "";

  if(
    p === "/" ||
    p === "/pos" ||
    p === "/pos/" ||
    p === "/pos/index.html" ||
    p === "/pos/login.html" ||
    p === "/pos/app.js" ||
    p === "/pos/style.css" ||
    p.startsWith("/api/")
  ){

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    );

    res.setHeader("Pragma","no-cache");
    res.setHeader("Expires","0");
  }

  next();

});

/* END SGAR_FINAL_LOGIN_CACHE_HEADERS */
/* SGAR_MAJOR_LOGIN_CACHE */

app.use((req,res,next)=>{

    const p = req.path || "";

    if(
        p === "/" ||
        p === "/pos" ||
        p === "/pos/" ||
        p === "/pos/index.html" ||
        p === "/pos/login.html" ||
        p === "/pos/app.js" ||
        p === "/pos/style.css" ||
        p.startsWith("/api/")
    ){

        res.setHeader(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
        );

        res.setHeader("Pragma","no-cache");
        res.setHeader("Expires","0");

    }

    next();

});

/* END SGAR_MAJOR_LOGIN_CACHE */app.use(express.static(publicDir));
app.get("/b/:slug/pos",(_,res)=>res.sendFile(path.join(publicDir,"pos/index.html")));
app.get("/b/:slug/pos/*rest",(_,res)=>res.sendFile(path.join(publicDir,"pos/index.html")));
app.get("/admin/*rest",(_,res)=>res.sendFile(path.join(publicDir,"admin/index.html")));
app.get("/kds/*rest",(_,res)=>res.sendFile(path.join(publicDir,"kds/index.html")));
app.get("/order/:token",(_,res)=>res.sendFile(path.join(publicDir,"customer/index.html")));
app.get("*rest",(_,res)=>res.sendFile(path.join(publicDir,"pos/index.html")));

if (process.env.NETLIFY !== "true") {
  initRealtime(server);

  const port = Number(process.env.PORT || 4000);
  const host = process.env.HOST || "0.0.0.0";

  server.listen(port, host, () => {
    console.log(`Server running on ${host}:${port}`);
  });
}

export { app };



