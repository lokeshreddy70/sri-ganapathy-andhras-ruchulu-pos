import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type express from "express";

function findAsset(...parts: string[]) {
    const candidates = [
        path.join(process.cwd(), ...parts),
        path.join(process.cwd(), "netlify", "functions", ...parts)
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

function money(value: number) {
    return `Rs. ${value.toFixed(2)}`;
}

export async function receiptPdf(
    res: express.Response,
    order: any,
    mode: "inline" | "attachment" = "inline"
) {
    const branch = order.branch;
    const config = branch.receiptConfig || {};

    const paperWidth =
        Number(branch.receiptPaperWidth || 80) === 58
            ? 164
            : 226;

    const doc = new PDFDocument({
        size: [paperWidth, 1200],
        margin: 10
    });

    const filename =
        `${order.invoiceNumber || order.number || order.id}.pdf`
            .replace(/[^a-zA-Z0-9._-]/g, "_");

    res.setHeader(
        "Content-Type",
        "application/pdf"
    );

    res.setHeader(
        "Content-Disposition",
        `${mode}; filename="${filename}"`
    );

    doc.pipe(res);

    const regularFont = findAsset(
        "fonts",
        "NotoSansDevanagari-Regular.ttf"
    );

    const boldFont = findAsset(
        "fonts",
        "NotoSansDevanagari-Bold.ttf"
    );

    if (regularFont) {
        doc.registerFont("SGAR-Regular", regularFont);
        doc.font("SGAR-Regular");
    }

    const bold = () => {
        if (boldFont) {
            doc.font("SGAR-Bold");
        }
    };

    const regular = () => {
        if (regularFont) {
            doc.font("SGAR-Regular");
        }
    };

    const center = (
        value: string,
        size = 8
    ) => {
        doc
            .fontSize(size)
            .text(value || "", {
                align: "center"
            });
    };

    const line = () => {
        doc
            .fontSize(7)
            .text(
                "----------------------------------------",
                {
                    align: "center"
                }
            );
    };

    const logo = findAsset(
        "assets",
        "logo-primary.jpg"
    );

    if (
        logo &&
        config.showLogo !== false
    ) {
        try {
            doc.image(
                logo,
                (paperWidth - 55) / 2,
                undefined,
                {
                    width: 55,
                    height: 55
                }
            );
            doc.moveDown(0.4);
        } catch {
            // Logo is optional; receipt must continue.
        }
    }

    bold();

    if (config.headerText) {
        center(String(config.headerText), 10);
    } else {
        center(branch.name, 12);
    }

    regular();

    if (config.showAddress !== false && branch.address) {
        center(branch.address);
    }

    if (config.showPhone !== false && branch.phone) {
        center(`Phone: ${branch.phone}`);
    }

    if (config.showGstin !== false && branch.gstin) {
        center(`GSTIN: ${branch.gstin}`);
    }

    if (branch.fssai && config.showFssai !== false) {
        center(`FSSAI: ${branch.fssai}`);
    }

    center(
        branch.invoiceTitle || "TAX INVOICE",
        10
    );

    line();

    doc.fontSize(8);

    doc.text(
        `Bill No: ${order.invoiceNumber || order.number || "-"}`
    );

    doc.text(
        `Date: ${new Date(order.createdAt).toLocaleString("en-IN")}`
    );

    doc.text(
        `Cashier: ${order.cashier?.name || "-"}`
    );

    if (order.bench?.name) {
        doc.text(
            `Location: ${order.bench.name}`
        );
    } else if (order.locationName) {
        doc.text(
            `Location: ${order.locationName}`
        );
    }

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

    line();

    for (const item of order.lines || []) {
        const name =
            item.menuItem?.name ||
            item.name ||
            "Item";

        const quantity =
            Number(item.quantity || 0);

        const unitPrice =
            Number(
                item.unitPrice ??
                item.price ??
                0
            );

        const total =
            Number(
                item.lineTotal ??
                quantity * unitPrice
            );

        doc.fontSize(8).text(
            `${name}`
        );

        doc.fontSize(7).text(
            `${quantity} x ${money(unitPrice)} = ${money(total)}`
        );
    }

    line();

    const subtotal = Number(
        order.subtotal || 0
    );

    const tax = Number(
        order.tax || order.taxAmount || 0
    );

    const discount = Number(
        order.discount || 0
    );

    const total = Number(
        order.total || 0
    );

    doc.fontSize(8);

    doc.text(`Subtotal: ${money(subtotal)}`);

    if (discount > 0) {
        doc.text(
            `Discount: ${money(discount)}`
        );
    }

    if (tax > 0) {
        doc.text(
            `Tax: ${money(tax)}`
        );
    }

    bold();

    doc.fontSize(10).text(
        `TOTAL: ${money(total)}`
    );

    regular();

    const payment =
        order.paymentMethod ||
        order.payment ||
        "Pending";

    doc.fontSize(8).text(
        `Payment: ${payment}`
    );

    if (
        config.footerText
    ) {
        doc.moveDown(0.4);
        center(
            String(config.footerText)
        );
    } else if (
        branch.receiptFooter
    ) {
        doc.moveDown(0.4);
        center(
            branch.receiptFooter
        );
    }

    doc.end();
}
