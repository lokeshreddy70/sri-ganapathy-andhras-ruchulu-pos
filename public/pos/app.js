/* ============================================================
   SRI GANAPATHY ANDHRA'S RUCHULU
   PRODUCTION POS APPLICATION
   ============================================================ */

const state = {
    user: null,
    branches: [],
    branch: null,
    menu: [],
    benches: [],
    orders: [],
    expenses: [],
    printers: [],

    page: "billing",
    category: "All",
    search: "",

    cart: [],
    payment: "CASH",
    orderType: "DINE_IN",

    discount: 0,
    benchId: "",
    customerName: "",
    notes: "",

    online: navigator.onLine,
    realtime: null
};

const $ = (selector, root = document) =>
    root.querySelector(selector);

const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

const money = value =>
    "₹" + Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

const esc = value =>
    String(value ?? "").replace(/[&<>'"]/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[char]));

const fmtDate = value =>
    new Date(value).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    });

const fmtTime = value =>
    new Date(value).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit"
    });

async function api(url, options = {}) {

    const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        ...options,

        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const data = await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
        throw Error(
            data.error ||
            `Request failed (${response.status})`
        );
    }

    return data;
}

function toast(message, type = "ok") {

    const element = document.createElement("div");

    element.className = `toast ${type}`;
    element.textContent = message;

    document.body.appendChild(element);

    setTimeout(() => {
        element.classList.add("show");
    }, 10);

    setTimeout(() => {

        element.classList.remove("show");

        setTimeout(() => element.remove(), 220);

    }, 2600);
}

function setBusy(button, busy, text = "Saving…") {

    if (!button) return;

    button.disabled = busy;

    if (busy) {

        button.dataset.oldText = button.textContent;
        button.textContent = text;

    } else {

        button.textContent =
            button.dataset.oldText ||
            button.textContent;
    }
}

function isSuper() {

    return state.user?.role === "SUPER_ADMIN";
}

function canAdmin() {

    return [
        "SUPER_ADMIN",
        "ADMIN",
        "MANAGER"
    ].includes(state.user?.role);
}

function branchId() {

    return (
        state.branch?.id ||
        state.user?.branchId ||
        ""
    );
}

function pathBranch() {

    const match =
        location.pathname.match(
            /^\/b\/([^/]+)\/pos/
        );

    return match?.[1] || null;
}

function categories() {

    return [
        "All",
        ...new Set(
            state.menu
                .map(item => item.category)
                .filter(Boolean)
        )
    ];
}

function subtotal() {

    return state.cart.reduce(
        (total, item) =>
            total +
            Number(item.price) *
            item.qty,
        0
    );
}

function totals() {

    const sub = subtotal();

    const discount = Math.min(
        Number(state.discount) || 0,
        sub
    );

    const rate =
        state.branch?.taxEnabled
            ? Number(state.branch.taxRate || 0)
            : 0;

    const tax =
        ((sub - discount) * rate) / 100;

    return {
        sub,
        discount,
        tax,
        total: sub - discount + tax
    };
}

async function loadBranchData() {

    const id = branchId();

    state.menu =
        await api(
            "/api/menu?branchId=" +
            encodeURIComponent(id)
        );

    state.benches =
        await api(
            "/api/benches?branchId=" +
            encodeURIComponent(id)
        );

    state.orders =
        await api(
            "/api/orders?branchId=" +
            encodeURIComponent(id)
        );

    state.expenses =
        await api(
            "/api/expenses?branchId=" +
            encodeURIComponent(id)
        ).catch(() => []);

    state.printers =
        await api(
            "/api/printers?branchId=" +
            encodeURIComponent(id)
        ).catch(() => []);

    if (!state.benchId) {

        state.benchId =
            state.benches[0]?.id || "";
    }
}

/* ============================================================
   APPLICATION SHELL
   ============================================================ */

function renderShell() {

    document.body.innerHTML = `

<div class="appShell">

    <aside class="sidebar">

        <div class="brand">

            <img
                src="/brand/logo-icon.jpg"
                alt="Sri Ganapathy"
            >

            <div>
                <strong>Sri Ganapathy</strong>
                <span>ANDHRA'S RUCHULU</span>
            </div>

        </div>

        <div class="branchBox">

            <label>ACTIVE BRANCH</label>

            <select id="branchSelect">

                ${state.branches.map(branch => `
                    <option
                        value="${branch.id}"
                        ${branch.id === state.branch.id ? "selected" : ""}
                    >
                        ${esc(branch.name)}
                    </option>
                `).join("")}

            </select>

        </div>

        <nav class="nav">

            ${nav("billing","▦","Billing")}

            ${nav("orders","☷","Orders")}

            ${nav("kitchen","◫","Kitchen")}

            ${nav("menu","◈","Menu")}

            ${nav("reports","▥","Reports")}

            ${nav("expenses","₹","Expenses")}

            ${nav("printers","▤","Printers")}

            ${nav("benches","⌗","Bench QR")}

            ${nav("settings","⚙","Settings")}

            ${nav("staff","♙","Staff")}

            ${
                isSuper()
                    ? nav("branches","▦","Branches")
                    : ""
            }

        </nav>

        <div class="sideBottom">

            <span class="liveDot"></span>
            Live · ${esc(state.user?.role || "USER")}

            <b>
                ${esc(state.user?.name || "")}
            </b>

            <button id="logout">
                Logout
            </button>

        </div>

    </aside>

    <section class="workspace">

        <header class="topbar">

            <div class="mobileTitle">

                <button id="mobileMenu">
                    ☰
                </button>

                <b>POS</b>

            </div>

            <div class="globalSearch">

                <span>⌕</span>

                <input
                    id="globalSearch"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="Search item or scan barcode…"
                >

            </div>

            <div class="topActions">

                <span
                    class="clock"
                    id="clock"
                ></span>

                <span
                    class="connection"
                    id="connection"
                >
                    <i></i>
                    Live
                </span>

                <button class="avatar">
                    ${esc(
                        (state.user?.name || "A")
                        .slice(0,1)
                        .toUpperCase()
                    )}
                </button>

            </div>

        </header>

        <main id="main"></main>

    </section>

    <aside
        class="cartPanel"
        id="cartPanel"
    ></aside>

</div>

<div id="modalRoot"></div>
`;

    $$(".navBtn").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.page === state.page
        );

        button.onclick = () => {

            state.page =
                button.dataset.page;

            renderPage();
        };
    });

    $("#branchSelect").onchange =
        async event => {

            const branch =
                state.branches.find(
                    item =>
                        item.id === event.target.value
                );

            if (!branch) return;

            state.branch = branch;
            state.cart = [];
            state.category = "All";
            state.search = "";
            state.page = "billing";

            await loadBranchData();

            renderPage();

            toast("Branch switched");
        };

    $("#logout").onclick =
        async () => {

            await api(
                "/api/auth/logout",
                { method: "POST" }
            );

            location.href = "/pos/";
        };

    $("#globalSearch").oninput =
        event => {

            state.search =
                event.target.value;

            if (state.page !== "billing") {

                state.page = "billing";
                renderPage();

            } else {

                renderBilling();
            }
        };

    $("#globalSearch").onkeydown =
        scanBarcode;

    $("#mobileMenu").onclick =
        () => {

            document.body.classList.toggle(
                "menuOpen"
            );
        };

    setInterval(() => {

        const clock = $("#clock");

        if (clock) {

            clock.textContent =
                new Date().toLocaleTimeString(
                    "en-IN",
                    {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                    }
                );
        }

    }, 1000);
}

function nav(page, icon, label) {

    const pending =
        state.orders.filter(
            order =>
                [
                    "PENDING",
                    "PREPARING",
                    "READY"
                ].includes(order.status)
        ).length;

    return `

<button
    class="navBtn"
    data-page="${page}"
>

    <span class="navIcon">
        ${icon}
    </span>

    <span>
        ${label}
    </span>

    ${
        page === "orders"
            ? `<em id="pendingCount">${pending}</em>`
            : ""
    }

</button>

`;
}

function renderPage() {

    document.body.classList.remove(
        "menuOpen"
    );

    $$(".navBtn").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.page === state.page
        );
    });

    const pages = {

        billing: renderBilling,
        orders: renderOrders,
        kitchen: renderKitchen,
        menu: renderMenu,
        reports: renderReports,
        expenses: renderExpenses,
        printers: renderPrinters,
        benches: renderBenches,
        settings: renderSettings,
        staff: renderStaff,
        branches: renderBranches
    };

    (pages[state.page] || renderBilling)();
}

/* ============================================================
   BILLING
   ============================================================ */

function renderBilling() {

    const filtered =
        state.menu.filter(item => {

            if (!item.active)
                return false;

            if (
                state.category !== "All" &&
                item.category !== state.category
            )
                return false;

            const text =
                `${item.name} ${
                    item.category
                } ${
                    item.barcode || ""
                }`.toLowerCase();

            return text.includes(
                state.search.toLowerCase()
            );
        });

    $("#main").innerHTML = `

<div class="billingPage">

    <div class="pageHead">

        <div>

            <p class="eyebrow">
                ${esc(state.branch?.code || "BRANCH")}
                · COUNTER BILLING
            </p>

            <h1>
                New Bill
            </h1>

            <span>
                Fast billing with live QR orders
                and thermal printing.
            </span>

        </div>

        <div class="headBtns">

            <button
                class="softBtn"
                onclick="refreshData()"
            >
                ↻ Refresh
            </button>

            <button
                class="softBtn"
                onclick="openShortcut()"
            >
                ⌘ Shortcuts
            </button>

        </div>

    </div>

    <div class="orderModes">

        ${
            ["DINE_IN","TAKE_AWAY","DELIVERY"]
                .map(type => `

<button
    class="mode ${
        state.orderType === type
            ? "active"
            : ""
    }"
    onclick="setOrderType('${type}')"
>

    ${
        type === "DINE_IN"
            ? "▣"
            : type === "TAKE_AWAY"
                ? "▢"
                : "⌁"
    }

    ${type.replace("_"," ")}

</button>

`)
                .join("")
        }

    </div>

    <div class="categoryBar">

        ${
            categories()
                .map(category => `

<button
    class="cat ${
        state.category === category
            ? "active"
            : ""
    }"
    onclick='setCategory(${JSON.stringify(category)})'
>
    ${esc(category)}
</button>

`)
                .join("")
        }

    </div>

    <div class="productGrid">

        ${
            filtered.map(productCard).join("")
            ||
            `
<div class="emptyState">

    <div>⌕</div>

    <b>
        No menu items found
    </b>

    <span>
        Try another search or category.
    </span>

</div>
`
        }

    </div>

</div>

`;

    renderCart();
}

function productCard(item) {

    const quantity =
        state.cart.find(
            line => line.id === item.id
        )?.qty || 0;

    return `

<button
    class="product"
    onclick="addItem('${item.id}')"
>

    <div class="productTop">

        <span class="foodIcon">
            ${foodIcon(item.category)}
        </span>

        ${
            quantity
                ? `<b class="qtyPill">${quantity}</b>`
                : ""
        }

    </div>

    <div class="productName">
        ${esc(item.name)}
    </div>

    <small>
        ${esc(item.category)}
        ${
            item.barcode
                ? ` · ${esc(item.barcode)}`
                : ""
        }
    </small>

    <strong>
        ${money(item.price)}
    </strong>

</button>

`;
}

function foodIcon(category) {

    const icons = {

        Meals: "🍛",
        Biryani: "🍲",
        Tiffins: "🥣",
        Curries: "🥘",
        Beverages: "☕",
        Desserts: "🍮",
        Combos: "🍱",
        Snacks: "🥟"
    };

    return icons[category] || "🍽️";
}

function renderCart() {

    const totalsData = totals();

    $("#cartPanel").innerHTML = `

<div class="cartHead">

    <div>

        <p class="eyebrow">
            CURRENT SALE
        </p>

        <h2>
            Bill
        </h2>

    </div>

    <button
        class="iconBtn"
        onclick="clearCart()"
    >
        ×
    </button>

</div>

<div class="cartMeta">

    <label>

        BENCH / TABLE

        <select id="benchSelect">

            <option value="">
                Counter
            </option>

            ${
                state.benches.map(
                    bench => `

<option
    value="${bench.id}"
    ${
        bench.id === state.benchId
            ? "selected"
            : ""
    }
>
    ${esc(bench.label)}
</option>

`
                ).join("")
            }

        </select>

    </label>

    <label>

        CUSTOMER

        <input
            id="customer"
            autocomplete="off"
            value="${esc(state.customerName)}"
            placeholder="Optional"
        >

    </label>

</div>

<div class="cartLines">

${
    state.cart.map(line => `

<div class="cartLine">

    <div>

        <b>
            ${esc(line.name)}
        </b>

        <small>
            ${money(line.price)} each
        </small>

    </div>

    <div class="qty">

        <button
            onclick="changeQty('${line.id}',-1)"
        >
            −
        </button>

        <b>
            ${line.qty}
        </b>

        <button
            onclick="changeQty('${line.id}',1)"
        >
            +
        </button>

    </div>

    <strong>
        ${money(
            Number(line.price) *
            line.qty
        )}
    </strong>

</div>

`).join("")
||
`
<div class="cartEmpty">

    <div>🧾</div>

    <b>
        No items yet
    </b>

    <span>
        Select items to start the bill.
    </span>

</div>
`
}

</div>

<div class="cartFooter">

    <div class="noteRow">

        <input
            id="notes"
            value="${esc(state.notes)}"
            placeholder="Order note / kitchen instruction…"
        >

    </div>

    <div class="discountRow">

        <span>
            Discount
        </span>

        <div>

            <input
                id="discount"
                type="number"
                min="0"
                step="0.01"
                value="${state.discount || 0}"
            >

            <button
                onclick="
                    state.discount =
                        Number($('#discount').value || 0);
                    renderCart();
                "
            >
                Apply
            </button>

        </div>

    </div>

    <div class="summary">

        <div>
            <span>Subtotal</span>
            <b>${money(totalsData.sub)}</b>
        </div>

        <div>
            <span>Discount</span>
            <b>− ${money(totalsData.discount)}</b>
        </div>

        <div>
            <span>
                Tax
                ${
                    state.branch?.taxEnabled
                        ? `(${Number(
                            state.branch.taxRate
                        )}%)`
                        : ""
                }
            </span>

            <b>
                ${money(totalsData.tax)}
            </b>
        </div>

        <div class="grand">

            <span>
                Total
            </span>

            <b>
                ${money(totalsData.total)}
            </b>

        </div>

    </div>

    <div class="payTitle">
        PAYMENT
    </div>

    <div class="payments">

        ${
            [
                "CASH",
                "UPI",
                "CARD",
                "CREDIT"
            ]
                .map(payment => `

<button
    class="pay ${
        state.payment === payment
            ? "active"
            : ""
    }"
    ${
        !paymentEnabled(payment)
            ? "disabled"
            : ""
    }
    onclick="setPayment('${payment}')"
>
    ${payment}
</button>

`)
                .join("")
        }

    </div>

    <button
        class="checkout"
        ${
            state.cart.length
                ? ""
                : "disabled"
        }
        onclick="placeOrder()"
    >

        Complete Bill

        <span>
            ${money(totalsData.total)}
            →
        </span>

    </button>

    <div class="billActions">

        <button
            onclick="holdOrder()"
            ${
                state.cart.length
                    ? ""
                    : "disabled"
            }
        >
            Hold
        </button>

        <button
            onclick="newBill()"
        >
            New Bill
        </button>

    </div>

</div>
`;

    $("#benchSelect").onchange =
        event =>
            state.benchId =
                event.target.value;

    $("#customer").oninput =
        event =>
            state.customerName =
                event.target.value;

    $("#notes").oninput =
        event =>
            state.notes =
                event.target.value;

    $("#discount").onchange =
        event => {

            state.discount =
                Number(event.target.value) || 0;

            renderCart();
        };
}

function paymentEnabled(payment) {

    if (payment === "CASH")
        return state.branch?.paymentCashEnabled !== false;

    if (payment === "UPI")
        return state.branch?.paymentUpiEnabled !== false;

    if (payment === "CARD")
        return state.branch?.paymentCardEnabled !== false;

    return true;
}

function setCategory(category) {

    state.category = category;

    renderBilling();
}

function setOrderType(type) {

    state.orderType = type;

    renderBilling();
}

function addItem(id) {

    const item =
        state.menu.find(
            menuItem =>
                menuItem.id === id
        );

    if (!item) return;

    const existing =
        state.cart.find(
            line =>
                line.id === id
        );

    if (existing) {

        existing.qty++;

    } else {

        state.cart.push({

            id: item.id,
            name: item.name,
            price: Number(item.price),
            qty: 1

        });
    }

    renderBilling();
}

function changeQty(id, difference) {

    const item =
        state.cart.find(
            line =>
                line.id === id
        );

    if (!item) return;

    item.qty += difference;

    if (item.qty <= 0) {

        state.cart =
            state.cart.filter(
                line =>
                    line.id !== id
            );
    }

    renderBilling();
}

function clearCart() {

    state.cart = [];
    state.discount = 0;
    state.customerName = "";
    state.notes = "";

    renderBilling();
}

function newBill() {

    clearCart();

    toast(
        "New bill ready"
    );
}

function holdOrder() {

    if (!state.cart.length) {

        toast(
            "Add items before holding",
            "warn"
        );

        return;
    }

    sessionStorage.setItem(
        "sgar_hold",
        JSON.stringify({
            cart: state.cart,
            discount: state.discount,
            customerName: state.customerName,
            notes: state.notes,
            benchId: state.benchId
        })
    );

    toast(
        "Bill held locally"
    );
}

async function placeOrder() {

    if (!state.cart.length)
        return;

    const button =
        $(".checkout");

    setBusy(
        button,
        true,
        "Creating bill…"
    );

    try {

        const calculated =
            totals();

        const order =
            await api(
                "/api/pos/orders",
                {
                    method: "POST",

                    body: JSON.stringify({

                        branchId:
                            branchId(),

                        benchId:
                            state.benchId ||
                            undefined,

                        customerName:
                            state.customerName ||
                            undefined,

                        notes:
                            state.notes ||
                            undefined,

                        paymentMethod:
                            state.payment,

                        discount:
                            calculated.discount,

                        lines:
                            state.cart.map(
                                item => ({
                                    menuItemId:
                                        item.id,
                                    quantity:
                                        item.qty
                                })
                            ),

                        clientRequestId:
                            crypto.randomUUID()
                    })
                }
            );

        state.orders.unshift(order);

        const orderId =
            order.id;

        clearCart();

        toast(
            `Bill ${
                order.invoiceNumber ||
                order.number
            } created · ${money(order.total)}`
        );

        /*
         * Open the real generated receipt.
         * PDF is generated on demand.
         */
        window.open(
            `/api/orders/${orderId}/pdf`,
            "_blank",
            "noopener"
        );

        await queuePrint(
            orderId,
            "RECEIPT"
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );

    } finally {

        setBusy(
            button,
            false
        );
    }
}

async function queuePrint(
    orderId,
    type,
    printerId
) {

    try {

        await api(
            "/api/print-jobs",
            {
                method: "POST",

                body: JSON.stringify({
                    orderId,
                    type,
                    printerId
                })
            }
        );

    } catch (error) {

        console.warn(
            "Print queue:",
            error
        );
    }
}

async function refreshData() {

    try {

        await loadBranchData();

        renderPage();

        toast(
            "Data refreshed"
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}

async function scanBarcode(event) {

    if (event.key !== "Enter")
        return;

    const value =
        event.target.value.trim();

    if (!value)
        return;

    try {

        const item =
            await api(
                "/api/menu/barcode/" +
                encodeURIComponent(value)
            );

        addItem(item.id);

        event.target.value = "";

        state.search = "";

        toast(
            `${item.name} added`
        );

    } catch {

        toast(
            "Barcode not found",
            "warn"
        );
    }
}

/* ============================================================
   ORDERS
   ============================================================ */

function renderOrders() {

    const active =
        state.orders.filter(
            order =>
                [
                    "PENDING",
                    "PREPARING",
                    "READY"
                ].includes(order.status)
        ).length;

    $("#main").innerHTML = `

<div class="pageHead">

    <div>

        <p class="eyebrow">
            LIVE OPERATIONS
        </p>

        <h1>
            Orders
        </h1>

        <span>
            ${state.orders.length}
            recent orders
        </span>

    </div>

    <div class="headBtns">

        <button
            class="softBtn"
            onclick="refreshData()"
        >
            ↻ Refresh
        </button>

        <button
            class="primaryBtn"
            onclick="
                state.page='billing';
                renderPage()
            "
        >
            + New Bill
        </button>

    </div>

</div>

<div class="statRow">

    <div class="miniStat">
        <small>Pending</small>
        <b>${active}</b>
    </div>

    <div class="miniStat">
        <small>Today</small>
        <b>
            ${
                state.orders.filter(
                    order =>
                        new Date(
                            order.createdAt
                        ).toDateString() ===
                        new Date().toDateString()
                ).length
            }
        </b>
    </div>

    <div class="miniStat">
        <small>QR</small>
        <b>
            ${
                state.orders.filter(
                    order =>
                        order.source === "QR"
                ).length
            }
        </b>
    </div>

    <div class="miniStat">
        <small>Completed</small>
        <b>
            ${
                state.orders.filter(
                    order =>
                        order.status ===
                        "COMPLETED"
                ).length
            }
        </b>
    </div>

</div>

<div class="filterRow">

    <button
        class="filter active"
        onclick="renderOrdersTable()"
    >
        All
    </button>

    ${
        [
            "PENDING",
            "PREPARING",
            "READY",
            "COMPLETED",
            "CANCELLED"
        ].map(status => `

<button
    class="filter"
    onclick="
        renderOrdersTable('${status}')
    "
>
    ${status}
</button>

`)
        .join("")
    }

</div>

<div id="ordersTable"></div>
`;

    renderOrdersTable();
}

function renderOrdersTable(status = "") {

    const rows =
        state.orders.filter(
            order =>
                !status ||
                order.status === status
        );

    $("#ordersTable").innerHTML = `

<div class="tableCard">

<table>

<thead>

<tr>

<th>Bill</th>
<th>Source</th>
<th>Location</th>
<th>Items</th>
<th>Total</th>
<th>Status</th>
<th>Time</th>
<th></th>

</tr>

</thead>

<tbody>

${
    rows.map(order => `

<tr>

<td>

<button
    class="linkBtn"
    onclick="
        openBill('${order.id}')
    "
>
    ${esc(
        order.invoiceNumber ||
        "#" + order.number
    )}
</button>

</td>

<td>

<span
    class="source ${
        order.source.toLowerCase()
    }"
>
    ${order.source}
</span>

</td>

<td>
    ${esc(
        order.bench?.label ||
        "Counter"
    )}
</td>

<td>
    ${
        order.lines.reduce(
            (total,line) =>
                total + line.quantity,
            0
        )
    }
</td>

<td>
    ${money(order.total)}
</td>

<td>

<span
    class="status ${
        order.status.toLowerCase()
    }"
>
    ${order.status}
</span>

</td>

<td>
    ${fmtDate(order.createdAt)}
</td>

<td>

<button
    class="tinyBtn"
    onclick="
        orderActions('${order.id}')
    "
>
    ⋮
</button>

</td>

</tr>

`).join("")
||
emptyRow(
    8,
    "No orders found"
)
}

</tbody>

</table>

</div>
`;
}

async function openBill(id) {

    const order =
        state.orders.find(
            item =>
                item.id === id
        ) ||
        await api(
            "/api/orders/" + id
        );

    showModal(
        "Bill details",
        billHtml(order),

        `
<button
    class="softBtn"
    onclick="
        window.open(
            '/api/orders/${order.id}/pdf',
            '_blank'
        )
    "
>
    Open / Print PDF
</button>

<button
    class="primaryBtn"
    onclick="
        queuePrint(
            '${order.id}',
            'RECEIPT'
        );
        closeModal();
        toast('Receipt sent to print queue')
    "
>
    Thermal Print
</button>
`
    );
}

function billHtml(order) {

    return `

<div class="billPreview">

    <div class="billTop">

        <b>
            ${esc(order.branch.name)}
        </b>

        <span>
            ${esc(
                order.invoiceNumber ||
                "#" + order.number
            )}
        </span>

    </div>

    <small>
        ${fmtDate(order.createdAt)}
        ·
        ${esc(
            order.cashier?.name ||
            "Counter"
        )}
    </small>

    ${
        order.lines.map(
            line => `

<div class="billLine">

    <span>
        ${esc(
            line.menuItem.name
        )}
        ×
        ${line.quantity}
    </span>

    <b>
        ${money(line.lineTotal)}
    </b>

</div>

`
        ).join("")
    }

    <hr>

    <div class="billLine">
        <span>Subtotal</span>
        <b>${money(order.subtotal)}</b>
    </div>

    <div class="billLine">
        <span>Discount</span>
        <b>
            − ${money(order.discount)}
        </b>
    </div>

    <div class="billLine">
        <span>Tax</span>
        <b>${money(order.tax)}</b>
    </div>

    <div class="billTotal">
        <span>Total</span>
        <b>${money(order.total)}</b>
    </div>

    <div class="billMeta">

        Payment:
        ${esc(order.paymentMethod || "UNPAID")}

        ·

        Status:
        ${esc(order.status)}

    </div>

</div>

`;
}

function orderActions(id) {

    showModal(
        "Order actions",

        `
<div class="actionGrid">

${
    [
        "ACCEPTED",
        "PREPARING",
        "READY",
        "SERVED",
        "COMPLETED",
        "CANCELLED"
    ]
        .map(
            status => `

<button
    class="actionCard"
    onclick="
        setStatus(
            '${id}',
            '${status}'
        )
    "
>

    <b>
        ${status}
    </b>

    <small>
        Update order status
    </small>

</button>

`
        )
        .join("")
}

</div>
`,

        `
<button
    class="softBtn"
    onclick="
        window.open(
            '/api/orders/${id}/pdf',
            '_blank'
        )
    "
>
    PDF
</button>
`
    );
}

async function setStatus(id, status) {

    try {

        const updated =
            await api(
                "/api/orders/" +
                id +
                "/status",
                {
                    method: "PATCH",

                    body:
                        JSON.stringify({
                            status
                        })
                }
            );

        const index =
            state.orders.findIndex(
                order =>
                    order.id === id
            );

        if (index >= 0)
            state.orders[index] =
                updated;

        closeModal();

        renderPage();

        toast(
            `Order updated to ${status}`
        );

        if (status === "PREPARING") {

            await queuePrint(
                id,
                "KOT"
            );
        }

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}

/* ============================================================
   KITCHEN
   ============================================================ */

function renderKitchen() {

    const active =
        state.orders.filter(
            order =>
                [
                    "PENDING",
                    "ACCEPTED",
                    "PREPARING",
                    "READY"
                ].includes(order.status)
        );

    $("#main").innerHTML = `

<div class="pageHead">

    <div>

        <p class="eyebrow">
            KITCHEN DISPLAY
        </p>

        <h1>
            Kitchen Queue
        </h1>

        <span>
            Live production board
        </span>

    </div>

    <div class="headBtns">

        <button
            class="softBtn"
            onclick="refreshData()"
        >
            ↻ Refresh
        </button>

        <a
            class="softBtn linkLike"
            href="/kds/"
            target="_blank"
        >
            Open KDS ↗
        </a>

    </div>

</div>

<div class="kitchenGrid">

${
    active.map(order => `

<article
    class="kCard ${order.status.toLowerCase()}"
>

<header>

<div>

    <b>
        #${esc(
            order.invoiceNumber ||
            order.number
        )}
    </b>

    <span>
        ${esc(
            order.bench?.label ||
            "Counter"
        )}

        ·

        ${fmtTime(
            order.createdAt
        )}
    </span>

</div>

<em>
    ${order.source}
</em>

</header>

<div class="kLines">

${
    order.lines.map(
        line => `

<div>

<span>
    ${esc(
        line.menuItem.name
    )}
</span>

<b>
    ×${line.quantity}
</b>

</div>

`
    ).join("")
}

</div>

<small>
    ${esc(order.notes || "")}
</small>

<footer>

${
    order.status === "PENDING"
        ? `
<button
    class="primaryBtn"
    onclick="
        setStatus(
            '${order.id}',
            'ACCEPTED'
        )
    "
>
    Accept
</button>
`
        : ""
}

${
    order.status === "ACCEPTED"
        ? `
<button
    class="primaryBtn"
    onclick="
        setStatus(
            '${order.id}',
            'PREPARING'
        )
    "
>
    Start Kitchen
</button>
`
        : ""
}

${
    order.status === "PREPARING"
        ? `
<button
    class="primaryBtn"
    onclick="
        setStatus(
            '${order.id}',
            'READY'
        )
    "
>
    Mark Ready
</button>
`
        : ""
}

${
    order.status === "READY"
        ? `
<button
    class="primaryBtn"
    onclick="
        setStatus(
            '${order.id}',
            'SERVED'
        )
    "
>
    Served
</button>
`
        : ""
}

</footer>

</article>

`).join("")
||
`
<div class="emptyState">

    <div>✓</div>

    <b>
        Kitchen queue clear
    </b>

    <span>
        New QR and counter orders
        will appear here.
    </span>

</div>
`
}

</div>
`;
}

/* ============================================================
   MENU
   ============================================================ */

function renderMenu() {

    const rows =
        state.menu;

    $("#main").innerHTML = `

<div class="pageHead">

    <div>

        <p class="eyebrow">
            CATALOG
        </p>

        <h1>
            Menu Management
        </h1>

        <span>
            Prices, barcodes, HSN and availability
        </span>

    </div>

    <div class="headBtns">

        ${
            canAdmin()
                ? `
<button
    class="primaryBtn"
    onclick="menuModal()"
>
    + Add Menu Item
</button>
`
                : ""
        }

    </div>

</div>

<div class="toolbarLine">

    <input
        class="pageSearch"
        id="menuSearch"
        placeholder="Search menu…"
    >

    <span>
        ${rows.length} items
    </span>

</div>

<div class="tableCard">

<table>

<thead>

<tr>

<th>Item</th>
<th>Category</th>
<th>Price</th>
<th>Barcode</th>
<th>HSN</th>
<th>Status</th>
<th></th>

</tr>

</thead>

<tbody id="menuRows"></tbody>

</table>

</div>
`;

    const draw = () => {

        const value =
            $("#menuSearch").value
                .toLowerCase();

        $("#menuRows").innerHTML =
            rows
                .filter(item =>
                    `${item.name}
                    ${item.category}
                    ${item.barcode || ""}`
                    .toLowerCase()
                    .includes(value)
                )
                .map(item => `

<tr>

<td>

<b>
    ${esc(item.name)}
</b>

<small class="cellSub">
    ${esc(
        item.description || ""
    )}
</small>

</td>

<td>
    ${esc(item.category)}
</td>

<td>
    ${money(item.price)}
</td>

<td>
    ${esc(
        item.barcode || "—"
    )}
</td>

<td>
    ${esc(
        item.hsnCode || "—"
    )}
</td>

<td>

<span
    class="status ${
        item.active
            ? "completed"
            : "cancelled"
    }"
>
    ${
        item.active
            ? "ACTIVE"
            : "DISABLED"
    }
</span>

</td>

<td>

${
    canAdmin()
        ? `
<button
    class="tinyBtn"
    onclick='menuModal(${JSON.stringify(item)})'
>
    Edit
</button>
`
        : ""
}

</td>

</tr>

`)
                .join("")
            ||
            emptyRow(
                7,
                "No menu items"
            );
    };

    $("#menuSearch").oninput =
        draw;

    draw();
}

function menuModal(item = null) {

    showModal(
        item
            ? "Edit menu item"
            : "Add menu item",

        `

<div class="formGrid">

<label>
    Name
    <input
        id="mName"
        value="${esc(item?.name || "")}"
    >
</label>

<label>
    Category
    <input
        id="mCat"
        value="${esc(
            item?.category ||
            "Meals"
        )}"
    >
</label>

<label>
    Price
    <input
        id="mPrice"
        type="number"
        step="0.01"
        value="${item?.price ?? ""}"
    >
</label>

<label>
    Barcode
    <input
        id="mBarcode"
        autocomplete="off"
        value="${esc(
            item?.barcode || ""
        )}"
    >
</label>

<label>
    HSN Code
    <input
        id="mHsn"
        value="${esc(
            item?.hsnCode || ""
        )}"
    >
</label>

<label>
    Tax %
    <input
        id="mTax"
        type="number"
        step="0.01"
        value="${item?.taxRate ?? ""}"
    >
</label>

<label class="full">
    Description
    <input
        id="mDesc"
        value="${esc(
            item?.description || ""
        )}"
    >
</label>

<label>
    Sort order
    <input
        id="mSort"
        type="number"
        value="${item?.sortOrder || 0}"
    >
</label>

<label>
    Active

    <select id="mActive">

        <option
            value="true"
            ${
                item?.active !== false
                    ? "selected"
                    : ""
            }
        >
            Active
        </option>

        <option
            value="false"
            ${
                item?.active === false
                    ? "selected"
                    : ""
            }
        >
            Disabled
        </option>

    </select>

</label>

</div>
`,

        `

<button
    class="softBtn"
    onclick="closeModal()"
>
    Cancel
</button>

<button
    class="primaryBtn"
    onclick="
        saveMenu(
            ${item ? `'${item.id}'` : "null"}
        )
    "
>
    Save item
</button>
`
    );
}

async function saveMenu(id) {

    const body = {

        branchId:
            branchId(),

        name:
            $("#mName").value.trim(),

        category:
            $("#mCat").value.trim(),

        price:
            Number(
                $("#mPrice").value
            ),

        barcode:
            $("#mBarcode").value.trim() ||
            null,

        hsnCode:
            $("#mHsn").value.trim() ||
            null,

        taxRate:
            $("#mTax").value === ""
                ? null
                : Number(
                    $("#mTax").value
                ),

        description:
            $("#mDesc").value.trim(),

        sortOrder:
            Number(
                $("#mSort").value || 0
            ),

        active:
            $("#mActive").value === "true"
    };

    try {

        await api(
            id
                ? "/api/menu/" + id
                : "/api/menu",
            {
                method:
                    id
                        ? "PATCH"
                        : "POST",

                body:
                    JSON.stringify(body)
            }
        );

        await loadBranchData();

        closeModal();

        renderMenu();

        toast(
            "Menu saved"
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}

/* ============================================================
   REPORTS
   ============================================================ */

function renderReports() {

    const today =
        state.orders.filter(
            order =>
                new Date(
                    order.createdAt
                ).toDateString() ===
                new Date().toDateString() &&
                order.status !== "CANCELLED"
        );

    const sales =
        today.reduce(
            (sum, order) =>
                sum + Number(order.total),
            0
        );

    const tax =
        today.reduce(
            (sum, order) =>
                sum + Number(order.tax),
            0
        );

    const discount =
        today.reduce(
            (sum, order) =>
                sum + Number(order.discount),
            0
        );

    const payments = {
        CASH: 0,
        UPI: 0,
        CARD: 0,
        CREDIT: 0
    };

    const itemMap = {};

    today.forEach(order => {

        payments[
            order.paymentMethod ||
            "CASH"
        ] += Number(order.total);

        order.lines.forEach(line => {

            const name =
                line.menuItem.name;

            itemMap[name] =
                (itemMap[name] || 0) +
                line.quantity;
        });
    });

    const topItems =
        Object.entries(itemMap)
            .sort(
                (a,b) =>
                    b[1] - a[1]
            )
            .slice(0,10);

    $("#main").innerHTML = `

<div class="pageHead">

    <div>

        <p class="eyebrow">
            REPORTS
        </p>

        <h1>
            Sales & Performance
        </h1>

        <span>
            Today · ${esc(
                state.branch.name
            )}
        </span>

    </div>

    <button
        class="softBtn"
        onclick="refreshData()"
    >
        ↻ Refresh
    </button>

</div>

<div class="statRow">

<div class="miniStat">
    <small>Gross Sales</small>
    <b>${money(sales)}</b>
</div>

<div class="miniStat">
    <small>Orders</small>
    <b>${today.length}</b>
</div>

<div class="miniStat">
    <small>Tax</small>
    <b>${money(tax)}</b>
</div>

<div class="miniStat">
    <small>Discounts</small>
    <b>${money(discount)}</b>
</div>

</div>

<div class="reportGrid">

<section class="panel">

<h3>
    Payment split
</h3>

${
    Object.entries(payments)
        .map(
            ([name,value]) => `

<div class="barRow">

<span>
    ${name}
</span>

<div>
    <i
        style="
            width:${
                sales
                    ? Math.min(
                        100,
                        value / sales * 100
                    )
                    : 0
            }%
        "
    ></i>
</div>

<b>
    ${money(value)}
</b>

</div>

`
        )
        .join("")
}

</section>

<section class="panel">

<h3>
    Top selling items
</h3>

${
    topItems.map(
        ([name,count]) => `

<div class="rankRow">

<span>
    ${esc(name)}
</span>

<b>
    ${count} sold
</b>

</div>

`
    ).join("")
    ||
    `<div class="muted">
        No sales today.
    </div>`
}

</section>

</div>
`;
}

/* ============================================================
   EXPENSES
   ============================================================ */

function renderExpenses() {

    const total =
        state.expenses.reduce(
            (sum,item) =>
                sum + Number(item.amount),
            0
        );

    $("#main").innerHTML = `

<div class="pageHead">

    <div>

        <p class="eyebrow">
            CASH CONTROL
        </p>

        <h1>
            Expenses
        </h1>

        <span>
            ${state.expenses.length}
            entries · ${money(total)}
        </span>

    </div>

    ${
        canAdmin()
            ? `
<button
    class="primaryBtn"
    onclick="expenseModal()"
>
    + Add Expense
</button>
`
            : ""
    }

</div>

<div class="tableCard">

<table>

<thead>

<tr>

<th>Title</th>
<th>Category</th>
<th>Amount</th>
<th>Date</th>

</tr>

</thead>

<tbody>

${
    state.expenses.map(
        item => `

<tr>

<td>
    ${esc(item.title)}
</td>

<td>
    ${esc(item.category)}
</td>

<td>
    ${money(item.amount)}
</td>

<td>
    ${fmtDate(item.createdAt)}
</td>

</tr>

`
    ).join("")
    ||
    emptyRow(
        4,
        "No expenses recorded"
    )
}

</tbody>

</table>

</div>
`;
}

function expenseModal() {

    showModal(
        "Record expense",

        `

<div class="formGrid">

<label>
    Title
    <input id="eTitle">
</label>

<label>
    Category
    <input
        id="eCat"
        value="Supplies"
    >
</label>

<label>
    Amount
    <input
        id="eAmount"
        type="number"
        step="0.01"
    >
</label>

</div>

`,

        `

<button
    class="softBtn"
    onclick="closeModal()"
>
    Cancel
</button>

<button
    class="primaryBtn"
    onclick="saveExpense()"
>
    Save expense
</button>
`
    );
}

async function saveExpense() {

    try {

        await api(
            "/api/expenses",
            {
                method: "POST",

                body:
                    JSON.stringify({

                        branchId:
                            branchId(),

                        title:
                            $("#eTitle")
                                .value
                                .trim(),

                        category:
                            $("#eCat")
                                .value
                                .trim(),

                        amount:
                            Number(
                                $("#eAmount")
                                    .value
                            )
                    })
            }
        );

        state.expenses =
            await api(
                "/api/expenses?branchId=" +
                branchId()
            );

        closeModal();

        renderExpenses();

        toast(
            "Expense saved"
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}

/* ============================================================
   PRINTERS
   ============================================================ */

function renderPrinters() {

    $("#main").innerHTML = `

<div class="pageHead">

<div>

<p class="eyebrow">
    HARDWARE
</p>

<h1>
    Printers
</h1>

<span>
    Thermal receipt / KOT configuration
</span>

</div>

${
    canAdmin()
        ? `
<button
    class="primaryBtn"
    onclick="printerModal()"
>
    + Add Printer
</button>
`
        : ""
}

</div>

<div class="printerGrid">

${
    state.printers.map(
        printer => `

<div class="panel printerCard">

<div class="printerIcon">
    ▤
</div>

<h3>
    ${esc(printer.name)}
</h3>

<span>
    ${esc(printer.type)}
    ·
    ${esc(printer.connection)}
    ·
    ${printer.paperWidth}mm
</span>

<span
    class="dot ${
        printer.active
            ? "on"
            : ""
    }"
></span>

<p>

${
    printer.host
        ? `Host ${esc(
            printer.host
        )}${
            printer.port
                ? ":" + printer.port
                : ""
        }`
        : "Local print agent / configured connection"
}

</p>

<code>
    ${esc(
        printer.agentToken || ""
    )}
</code>

</div>

`
    ).join("")
    ||
    `
<div class="emptyState">

<div>▤</div>

<b>
    No printers configured
</b>

<span>
    Add the actual thermal printer
    or LAN print-agent configuration.
</span>

</div>
`
}

</div>
`;
}

function printerModal() {

    showModal(
        "Add printer",

        `

<div class="formGrid">

<label>
    Name
    <input
        id="pName"
        placeholder="Counter Receipt Printer"
    >
</label>

<label>
    Type

    <select id="pType">
        <option>THERMAL</option>
        <option>ESC_POS</option>
    </select>

</label>

<label>
    Connection

    <select id="pConn">
        <option>LAN</option>
        <option>USB</option>
        <option>BLUETOOTH</option>
        <option>WEB_SERIAL</option>
    </select>

</label>

<label>
    Host
    <input
        id="pHost"
        placeholder="192.168.1.50"
    >
</label>

<label>
    Port
    <input
        id="pPort"
        type="number"
        value="9100"
    >
</label>

<label>
    Paper width

    <select id="pWidth">
        <option>80</option>
        <option>58</option>
    </select>

</label>

<label>
    Copies

    <input
        id="pCopies"
        type="number"
        min="1"
        max="3"
        value="1"
    >

</label>

<label>
    Receipt

    <select id="pReceipt">
        <option value="true">
            Enabled
        </option>

        <option value="false">
            Disabled
        </option>
    </select>

</label>

<label>
    KOT

    <select id="pKot">

        <option value="true">
            Enabled
        </option>

        <option value="false">
            Disabled
        </option>

    </select>

</label>

</div>

`,

        `

<button
    class="softBtn"
    onclick="closeModal()"
>
    Cancel
</button>

<button
    class="primaryBtn"
    onclick="savePrinter()"
>
    Create printer
</button>

`
    );
}

async function savePrinter() {

    try {

        await api(
            "/api/printers",
            {
                method: "POST",

                body:
                    JSON.stringify({

                        branchId:
                            branchId(),

                        name:
                            $("#pName")
                                .value
                                .trim(),

                        type:
                            $("#pType")
                                .value,

                        connection:
                            $("#pConn")
                                .value,

                        host:
                            $("#pHost")
                                .value
                                .trim() ||
                            undefined,

                        port:
                            Number(
                                $("#pPort")
                                    .value
                            ) ||
                            undefined,

                        paperWidth:
                            Number(
                                $("#pWidth")
                                    .value
                            ),

                        copies:
                            Number(
                                $("#pCopies")
                                    .value
                            ),

                        receiptOn:
                            $("#pReceipt")
                                .value ===
                            "true",

                        kotOn:
                            $("#pKot")
                                .value ===
                            "true"
                    })
            }
        );

        state.printers =
            await api(
                "/api/printers?branchId=" +
                branchId()
            );

        closeModal();

        renderPrinters();

        toast(
            "Printer created"
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}

/* ============================================================
   BENCH QR
   ============================================================ */

function renderBenches() {

    $("#main").innerHTML = `

<div class="pageHead">

<div>

<p class="eyebrow">
    QR ORDERING
</p>

<h1>
    Bench QR Management
</h1>

<span>
    Every QR is permanently mapped
    to this branch and bench.
</span>

</div>

${
    canAdmin()
        ? `
<button
    class="primaryBtn"
    onclick="benchModal()"
>
    + Add Bench
</button>
`
        : ""
}

</div>

<div class="qrGrid">

${
    state.benches.map(
        bench => `

<article class="qrCard">

<img
    src="/api/benches/${bench.id}/qr.png"
    loading="lazy"
>

<b>
    ${esc(bench.label)}
</b>

<span>
    ${bench.active
        ? "Active"
        : "Disabled"}
</span>

<div class="qrActions">

<a
    href="/api/benches/${bench.id}/qr.png"
    target="_blank"
>
    Open
</a>

<a
    href="/api/benches/${bench.id}/qr.png"
    download
>
    Download
</a>

<a
    href="/order/${encodeURIComponent(
        bench.token
    )}"
    target="_blank"
>
    Test
</a>

</div>

</article>

`
    ).join("")
    ||
    `
<div class="emptyState">

<div>⌗</div>

<b>
    No benches
</b>

<span>
    Create a bench to generate
    its customer ordering QR.
</span>

</div>
`
}

</div>
`;
}

function benchModal() {

    showModal(
        "Add bench",

        `
<label class="fullField">

Bench / Table label

<input
    id="bLabel"
    placeholder="Bench 21"
>

</label>
`,

        `

<button
    class="softBtn"
    onclick="closeModal()"
>
    Cancel
</button>

<button
    class="primaryBtn"
    onclick="saveBench()"
>
    Create bench + QR
</button>

`
    );
}

async function saveBench() {

    try {

        await api(
            "/api/benches",
            {
                method: "POST",

                body:
                    JSON.stringify({

                        branchId:
                            branchId(),

                        label:
                            $("#bLabel")
                                .value
                                .trim()
                    })
            }
        );

        state.benches =
            await api(
                "/api/benches?branchId=" +
                branchId()
            );

        closeModal();

        renderBenches();

        toast(
            "Bench QR created"
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}

/* ============================================================
   SETTINGS
   ============================================================ */

function renderSettings() {

    const branch =
        state.branch;

    $("#main").innerHTML = `

<div class="pageHead">

<div>

<p class="eyebrow">
    CONFIGURATION
</p>

<h1>
    Business Settings
</h1>

<span>
    Receipt, tax, UPI and branch identity
</span>

</div>

${
    isSuper()
        ? `
<button
    class="primaryBtn"
    onclick="settingsModal()"
>
    Edit settings
</button>
`
        : ""
}

</div>

<div class="settingsGrid">

<section class="panel">

<h3>
    Business identity
</h3>

${kv(
    "Business",
    branch.name
)}

${kv(
    "Code",
    branch.code
)}

${kv(
    "Phone",
    branch.phone || "—"
)}

${kv(
    "GSTIN",
    branch.gstin ||
    "Not configured"
)}

${kv(
    "Address",
    branch.address ||
    "Not configured"
)}

</section>

<section class="panel">

<h3>
    Billing
</h3>

${kv(
    "Invoice prefix",
    branch.invoicePrefix
)}

${kv(
    "Invoice title",
    branch.invoiceTitle
)}

${kv(
    "Receipt paper",
    branch.receiptPaperWidth +
    "mm"
)}

${kv(
    "Tax",
    branch.taxEnabled
        ? Number(
            branch.taxRate
        ) + "%"
        : "Disabled"
)}

</section>

<section class="panel">

<h3>
    Payments
</h3>

${kv(
    "Cash",
    branch.paymentCashEnabled
        ? "Enabled"
        : "Disabled"
)}

${kv(
    "UPI",
    branch.paymentUpiEnabled
        ? (
            branch.upiId ||
            "Enabled · ID missing"
        )
        : "Disabled"
)}

${kv(
    "Card",
    branch.paymentCardEnabled
        ? "Enabled"
        : "Disabled"
)}

</section>

</div>
`;
}

function kv(key, value) {

    return `

<div class="kv">

<span>
    ${esc(key)}
</span>

<b>
    ${esc(value)}
</b>

</div>

`;
}

function settingsModal() {

    const branch =
        state.branch;

    showModal(
        "Branch settings",

        `

<div class="formGrid">

<label>
    Business name

    <input
        id="sName"
        value="${esc(branch.name)}"
    >
</label>

<label>
    Phone

    <input
        id="sPhone"
        value="${esc(
            branch.phone || ""
        )}"
    >
</label>

<label>
    GSTIN

    <input
        id="sGstin"
        value="${esc(
            branch.gstin || ""
        )}"
    >
</label>

<label>
    Invoice prefix

    <input
        id="sPrefix"
        value="${esc(
            branch.invoicePrefix
        )}"
    >
</label>

<label>
    Invoice title

    <input
        id="sTitle"
        value="${esc(
            branch.invoiceTitle
        )}"
    >
</label>

<label>
    Paper width

    <select id="sPaper">

        <option
            value="80"
            ${
                branch.receiptPaperWidth === 80
                    ? "selected"
                    : ""
            }
        >
            80mm
        </option>

        <option
            value="58"
            ${
                branch.receiptPaperWidth === 58
                    ? "selected"
                    : ""
            }
        >
            58mm
        </option>

    </select>

</label>

<label>
    UPI ID

    <input
        id="sUpi"
        value="${esc(
            branch.upiId || ""
        )}"
    >
</label>

<label>
    UPI name

    <input
        id="sUpiName"
        value="${esc(
            branch.upiName || ""
        )}"
    >
</label>

<label>
    Tax enabled

    <select id="sTax">

        <option
            value="false"
            ${
                !branch.taxEnabled
                    ? "selected"
                    : ""
            }
        >
            No
        </option>

        <option
            value="true"
            ${
                branch.taxEnabled
                    ? "selected"
                    : ""
            }
        >
            Yes
        </option>

    </select>

</label>

<label>
    Tax rate %

    <input
        id="sRate"
        type="number"
        step="0.01"
        value="${branch.taxRate || 0}"
    >
</label>

<label>
    Cash

    <select id="sCash">

        <option
            value="true"
            ${
                branch.paymentCashEnabled
                    ? "selected"
                    : ""
            }
        >
            Enabled
        </option>

        <option
            value="false"
            ${
                !branch.paymentCashEnabled
                    ? "selected"
                    : ""
            }
        >
            Disabled
        </option>

    </select>

</label>

<label>
    UPI payment

    <select id="sUpiOn">

        <option
            value="true"
            ${
                branch.paymentUpiEnabled
                    ? "selected"
                    : ""
            }
        >
            Enabled
        </option>

        <option
            value="false"
            ${
                !branch.paymentUpiEnabled
                    ? "selected"
                    : ""
            }
        >
            Disabled
        </option>

    </select>

</label>

<label>
    Card

    <select id="sCard">

        <option
            value="true"
            ${
                branch.paymentCardEnabled
                    ? "selected"
                    : ""
            }
        >
            Enabled
        </option>

        <option
            value="false"
            ${
                !branch.paymentCardEnabled
                    ? "selected"
                    : ""
            }
        >
            Disabled
        </option>

    </select>

</label>

<label class="full">
    Receipt header

    <input
        id="sHeader"
        value="${esc(
            branch.receiptHeader || ""
        )}"
    >
</label>

<label class="full">
    Receipt footer

    <input
        id="sFooter"
        value="${esc(
            branch.receiptFooter || ""
        )}"
    >
</label>

</div>
`,

        `

<button
    class="softBtn"
    onclick="closeModal()"
>
    Cancel
</button>

<button
    class="primaryBtn"
    onclick="saveSettings()"
>
    Save settings
</button>

`
    );
}

async function saveSettings() {

    const body = {

        name:
            $("#sName").value.trim(),

        phone:
            $("#sPhone").value.trim() ||
            null,

        gstin:
            $("#sGstin").value.trim() ||
            null,

        invoicePrefix:
            $("#sPrefix").value.trim(),

        invoiceTitle:
            $("#sTitle").value.trim(),

        receiptPaperWidth:
            Number(
                $("#sPaper").value
            ),

        upiId:
            $("#sUpi").value.trim() ||
            null,

        upiName:
            $("#sUpiName").value.trim() ||
            null,

        taxEnabled:
            $("#sTax").value ===
            "true",

        taxRate:
            Number(
                $("#sRate").value || 0
            ),

        paymentCashEnabled:
            $("#sCash").value ===
            "true",

        paymentUpiEnabled:
            $("#sUpiOn").value ===
            "true",

        paymentCardEnabled:
            $("#sCard").value ===
            "true",

        receiptHeader:
            $("#sHeader").value,

        receiptFooter:
            $("#sFooter").value
    };

    try {

        state.branch =
            await api(
                "/api/branches/" +
                branchId(),
                {
                    method: "PATCH",

                    body:
                        JSON.stringify(body)
                }
            );

        state.branches =
            state.branches.map(
                branch =>
                    branch.id ===
                    state.branch.id
                        ? state.branch
                        : branch
            );

        closeModal();

        renderShell();

        renderPage();

        toast(
            "Settings saved"
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}

/* ============================================================
   STAFF
   ============================================================ */

async function renderStaff() {

    const users =
        await api("/api/users");

    $("#main").innerHTML = `

<div class="pageHead">

<div>

<p class="eyebrow">
    PEOPLE
</p>

<h1>
    Staff & Access
</h1>

<span>
    Production user accounts and roles
</span>

</div>

${
    canAdmin()
        ? `
<button
    class="primaryBtn"
    onclick="staffModal()"
>
    + Create user
</button>
`
        : ""
}

</div>

<div class="tableCard">

<table>

<thead>

<tr>

<th>Name</th>
<th>Username</th>
<th>Role</th>
<th>Branch</th>
<th>Status</th>
<th></th>

</tr>

</thead>

<tbody>

${
    users.map(
        user => `

<tr>

<td>
    <b>${esc(user.name)}</b>
</td>

<td>
    ${esc(user.username)}
</td>

<td>

<span class="roleTag">
    ${user.role}
</span>

</td>

<td>
    ${esc(
        user.branch?.name ||
        "All branches"
    )}
</td>

<td>
    ${user.active
        ? "Active"
        : "Disabled"}
</td>

<td>

<button
    class="tinyBtn"
    onclick="
        resetUser('${user.id}')
    "
>
    Change password
</button>

</td>

</tr>

`
    ).join("")
    ||
    emptyRow(
        6,
        "No staff accounts"
    )
}

</tbody>

</table>

</div>
`;
}

function staffModal() {

    showModal(
        "Create staff account",

        `

<div class="formGrid">

<label>
    Name

    <input id="uName">
</label>

<label>
    Username

    <input
        id="uUser"
        autocomplete="off"
        spellcheck="false"
    >
</label>

<label>
    Password

    <input
        id="uPass"
        type="password"
        autocomplete="new-password"
    >
</label>

<label>
    Role

    <select id="uRole">

        <option>
            CASHIER
        </option>

        <option>
            KITCHEN
        </option>

        <option>
            MANAGER
        </option>

        <option>
            ADMIN
        </option>

    </select>

</label>

<label class="full">
    Branch

    <select id="uBranch">

        ${
            state.branches.map(
                branch => `

<option value="${branch.id}">
    ${esc(branch.name)}
</option>

`
            ).join("")
        }

    </select>

</label>

</div>
`,

        `

<button
    class="softBtn"
    onclick="closeModal()"
>
    Cancel
</button>

<button
    class="primaryBtn"
    onclick="saveStaff()"
>
    Create account
</button>

`
    );
}

async function saveStaff() {

    try {

        await api(
            "/api/users",
            {
                method: "POST",

                body:
                    JSON.stringify({

                        name:
                            $("#uName")
                                .value
                                .trim(),

                        username:
                            $("#uUser")
                                .value
                                .trim(),

                        password:
                            $("#uPass")
                                .value,

                        role:
                            $("#uRole")
                                .value,

                        branchId:
                            $("#uBranch")
                                .value
                    })
            }
        );

        closeModal();

        renderStaff();

        toast(
            "Staff account created"
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}

async function resetUser(id) {

    const password =
        prompt(
            "New password (minimum 8 characters)"
        );

    if (!password)
        return;

    try {

        await api(
            "/api/users/" +
            id +
            "/password",
            {
                method: "PATCH",

                body:
                    JSON.stringify({
                        password
                    })
            }
        );

        toast(
            "Password changed"
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}

/* ============================================================
    BRANCHES
   ============================================================ */

async function renderBranches() {

    $("#main").innerHTML = `

<div class="pageHead">

<div>

<p class="eyebrow">
    
</p>

<h1>
    Branch Network
</h1>

<span>
    Create and operate multiple
    independent canteen branches.
</span>

</div>

<button
    class="primaryBtn"
    onclick="branchModal()"
>
    + Create Branch
</button>

</div>

<div class="branchGrid">

${
    state.branches.map(
        branch => `

<article class="branchCard">

<div class="branchCardHead">

<span class="branchCode">
    ${esc(branch.code)}
</span>

<span class="status completed">
    ${
        branch.active
            ? "ACTIVE"
            : "OFFLINE"
    }
</span>

</div>

<h3>
    ${esc(branch.name)}
</h3>

<p>
    ${esc(
        branch.address ||
        "Address not configured"
    )}
</p>

<div class="branchStats">

<span>
    Phone
    <b>
        ${esc(
            branch.phone || "—"
        )}
    </b>
</span>

<span>
    Receipt
    <b>
        ${branch.receiptPaperWidth}mm
    </b>
</span>

</div>

<div class="branchActions">

<button
    onclick="
        switchBranch('${branch.id}')
    "
>
    Open POS
</button>

<button
    onclick="
        editBranch('${branch.id}')
    "
>
    Settings
</button>

<button
    onclick="
        branchQR('${branch.id}')
    "
>
    QRs
</button>

</div>

</article>

`
    ).join("")
}

</div>
`;
}

function branchModal() {

    showModal(
        "Create new branch",

        `

<div class="formGrid">

<label>
    Branch name
    <input
        id="brName"
        placeholder="Canteen 2"
    >
</label>

<label>
    Code
    <input
        id="brCode"
        placeholder="CAN2"
    >
</label>

<label>
    Slug
    <input
        id="brSlug"
        placeholder="canteen-2"
    >
</label>

<label>
    Phone
    <input id="brPhone">
</label>

<label>
    Address
    <input id="brAddress">
</label>

<label>
    GSTIN
    <input id="brGstin">
</label>

<label>
    Sales username
    <input
        id="brUser"
        autocomplete="off"
    >
</label>

<label>
    Sales password
    <input
        id="brPass"
        type="password"
        autocomplete="new-password"
    >
</label>

<label>
    Bench count
    <input
        id="brBenches"
        type="number"
        min="1"
        max="500"
        value="20"
    >
</label>

</div>
`,

        `

<button
    class="softBtn"
    onclick="closeModal()"
>
    Cancel
</button>

<button
    class="primaryBtn"
    onclick="saveBranch()"
>
    Create branch
</button>

`
    );
}

async function saveBranch() {

    try {

        const username =
            $("#brUser").value.trim();

        const branch =
            await api(
                "/api/branches",
                {
                    method: "POST",

                    body:
                        JSON.stringify({

                            name:
                                $("#brName")
                                    .value
                                    .trim(),

                            code:
                                $("#brCode")
                                    .value
                                    .trim(),

                            slug:
                                $("#brSlug")
                                    .value
                                    .trim() ||
                                undefined,

                            phone:
                                $("#brPhone")
                                    .value
                                    .trim() ||
                                undefined,

                            address:
                                $("#brAddress")
                                    .value
                                    .trim() ||
                                undefined,

                            gstin:
                                $("#brGstin")
                                    .value
                                    .trim() ||
                                undefined,

                            salesUsername:
                                username,

                            salesPassword:
                                $("#brPass")
                                    .value,

                            benchCount:
                                Number(
                                    $("#brBenches")
                                        .value ||
                                    20
                                )
                        })
                }
            );

        closeModal();

        state.branches =
            await api(
                "/api/branches"
            );

        renderBranches();

        showModal(
            "Branch created",

            `

<div class="successBox">

<b>
    ${esc(branch.name)}
</b>

<span>
    Branch POS URL
</span>

<code>
    ${esc(branch.posUrl)}
</code>

<span>
    Sales username
</span>

<code>
    ${esc(username)}
</code>

</div>
`,

            `
<button
    class="primaryBtn"
    onclick="closeModal()"
>
    Done
</button>
`
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}

async function editBranch(id) {

    const branch =
        await api(
            "/api/branches/" +
            id +
            "/settings"
        );

    showModal(
        "Branch settings",

        `

<div class="formGrid">

<label>
    Name
    <input
        id="ebName"
        value="${esc(
            branch.name
        )}"
    >
</label>

<label>
    Phone
    <input
        id="ebPhone"
        value="${esc(
            branch.phone || ""
        )}"
    >
</label>

<label>
    GSTIN
    <input
        id="ebGstin"
        value="${esc(
            branch.gstin || ""
        )}"
    >
</label>

<label>
    Invoice prefix
    <input
        id="ebPrefix"
        value="${esc(
            branch.invoicePrefix
        )}"
    >
</label>

<label>
    Invoice title
    <input
        id="ebTitle"
        value="${esc(
            branch.invoiceTitle
        )}"
    >
</label>

<label>
    Paper width

    <select id="ebPaper">

        <option
            value="80"
            ${
                branch.receiptPaperWidth === 80
                    ? "selected"
                    : ""
            }
        >
            80mm
        </option>

        <option
            value="58"
            ${
                branch.receiptPaperWidth === 58
                    ? "selected"
                    : ""
            }
        >
            58mm
        </option>

    </select>

</label>

<label>
    UPI ID
    <input
        id="ebUpi"
        value="${esc(
            branch.upiId || ""
        )}"
    >
</label>

<label>
    UPI name
    <input
        id="ebUpiName"
        value="${esc(
            branch.upiName || ""
        )}"
    >
</label>

</div>
`,

        `

<button
    class="softBtn"
    onclick="closeModal()"
>
    Cancel
</button>

<button
    class="primaryBtn"
    onclick="
        saveBranchSettings(
            '${id}'
        )
    "
>
    Save
</button>

`
    );
}

async function saveBranchSettings(id) {

    try {

        await api(
            "/api/branches/" +
            id,
            {
                method: "PATCH",

                body:
                    JSON.stringify({

                        name:
                            $("#ebName")
                                .value
                                .trim(),

                        phone:
                            $("#ebPhone")
                                .value
                                .trim() ||
                            null,

                        gstin:
                            $("#ebGstin")
                                .value
                                .trim() ||
                            null,

                        invoicePrefix:
                            $("#ebPrefix")
                                .value
                                .trim(),

                        invoiceTitle:
                            $("#ebTitle")
                                .value
                                .trim(),

                        receiptPaperWidth:
                            Number(
                                $("#ebPaper")
                                    .value
                            ),

                        upiId:
                            $("#ebUpi")
                                .value
                                .trim() ||
                            null,

                        upiName:
                            $("#ebUpiName")
                                .value
                                .trim() ||
                            null
                    })
            }
        );

        state.branches =
            await api(
                "/api/branches"
            );

        closeModal();

        renderBranches();

        toast(
            "Branch updated"
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}

async function switchBranch(id) {

    const branch =
        state.branches.find(
            item =>
                item.id === id
        );

    if (!branch)
        return;

    state.branch = branch;
    state.page = "billing";
    state.cart = [];

    await loadBranchData();

    renderShell();

    renderPage();

    toast(
        "Branch opened"
    );
}

async function branchQR(id) {

    const benches =
        await api(
            "/api/benches?branchId=" +
            id
        );

    showModal(
        "Bench QR codes",

        `

<div class="qrGrid compact">

${
    benches.map(
        bench => `

<article class="qrCard">

<img
    src="/api/benches/${bench.id}/qr.png"
>

<b>
    ${esc(bench.label)}
</b>

<div class="qrActions">

<a
    href="/api/benches/${bench.id}/qr.png"
    target="_blank"
>
    Open
</a>

<a
    href="/api/benches/${bench.id}/qr.png"
    download
>
    Download
</a>

</div>

</article>

`
    ).join("")
}

</div>
`,

        `
<button
    class="primaryBtn"
    onclick="closeModal()"
>
    Close
</button>
`
    );
}

/* ============================================================
   MODALS
   ============================================================ */

function showModal(
    title,
    body,
    actions = ""
) {

    const root =
        $("#modalRoot");

    root.innerHTML = `

<div
    class="modalBack"
    id="modal"
>

<section class="modal">

<header>

<div>

<p class="eyebrow">
    SRI GANAPATHY · MANAGEMENT
</p>

<h2>
    ${esc(title)}
</h2>

</div>

<button
    class="iconBtn"
    onclick="closeModal()"
>
    ×
</button>

</header>

<div class="modalBody">
    ${body}
</div>

<footer>
    ${actions}
</footer>

</section>

</div>
`;

    requestAnimationFrame(() => {

        $("#modal")
            .classList.add("show");
    });
}

function closeModal() {

    const modal =
        $("#modal");

    if (!modal)
        return;

    modal.classList.remove(
        "show"
    );

    setTimeout(() => {

        if ($("#modalRoot"))
            $("#modalRoot").innerHTML =
                "";

    }, 180);
}

function emptyRow(
    columns,
    text
) {

    return `

<tr>

<td
    colspan="${columns}"
    class="emptyCell"
>
    ${esc(text)}
</td>

</tr>
`;
}

/* ============================================================
   REALTIME
   ============================================================ */

function connectRealtime() {

    try {

        if (state.realtime)
            state.realtime.disconnect();

        state.realtime =
            io();

        state.realtime.emit(
            "join:branch",
            branchId()
        );

        state.realtime.on(
            "order:new",
            order => {

                if (
                    order.branchId !==
                    branchId()
                )
                    return;

                state.orders.unshift(
                    order
                );

                updatePending();

                if (
                    state.page === "orders" ||
                    state.page === "kitchen"
                ) {
                    renderPage();
                }

                toast(
                    `New ${order.source} order · #${order.number}`
                );
            }
        );

        state.realtime.on(
            "order:update",
            order => {

                const index =
                    state.orders.findIndex(
                        item =>
                            item.id ===
                            order.id
                    );

                if (index >= 0)
                    state.orders[index] =
                        order;
                else
                    state.orders.unshift(
                        order
                    );

                updatePending();

                if (
                    state.page === "orders" ||
                    state.page === "kitchen"
                )
                    renderPage();
            }
        );

        state.realtime.on(
            "connect",
            () => {

                state.online = true;

                const connection =
                    $("#connection");

                if (connection)
                    connection.innerHTML =
                        "<i></i> Live";
            }
        );

        state.realtime.on(
            "disconnect",
            () => {

                state.online = false;

                const connection =
                    $("#connection");

                if (connection)
                    connection.innerHTML =
                        '<i class="off"></i> Offline';
            }
        );

    } catch {}
}

function updatePending() {

    const element =
        $("#pendingCount");

    if (!element)
        return;

    element.textContent =
        state.orders.filter(
            order =>
                [
                    "PENDING",
                    "PREPARING",
                    "READY"
                ].includes(order.status)
        ).length;
}

/* ============================================================
   SHORTCUTS
   ============================================================ */

function openShortcut() {

    showModal(
        "Keyboard shortcuts",

        `

<div class="shortcut">
    <kbd>Ctrl</kbd>
    <kbd>K</kbd>
    <span>
        Focus item search
    </span>
</div>

<div class="shortcut">
    <kbd>F2</kbd>
    <span>
        New bill
    </span>
</div>

<div class="shortcut">
    <kbd>F4</kbd>
    <span>
        Complete current bill
    </span>
</div>

<div class="shortcut">
    <kbd>Esc</kbd>
    <span>
        Close dialog
    </span>
</div>

`,

        `
<button
    class="primaryBtn"
    onclick="closeModal()"
>
    Done
</button>
`
    );
}

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
            "Escape"
        )
            closeModal();

        if (
            event.key ===
            "F2"
        ) {

            event.preventDefault();

            newBill();
        }

        if (
            event.ctrlKey &&
            event.key.toLowerCase() ===
            "k"
        ) {

            event.preventDefault();

            $("#globalSearch")
                ?.focus();
        }

        if (
            event.key ===
            "F4"
        ) {

            event.preventDefault();

            if (state.cart.length)
                placeOrder();
        }
    }
);

/* ============================================================
   LOGIN
   ============================================================ */

async function legacyLogin() {

    document.body.innerHTML = `

<div class="loginScreen">

<div class="loginVisual">

<img
    src="/brand/splash-sheet.png"
    alt=""
>

<div class="visualOverlay">

<b>
    Sri Ganapathy Andhra's Ruchulu
</b>

<span>
    Production counter billing ·
    live branch operations
</span>

</div>

</div>

<div class="loginPane">

<form
    id="loginForm"
    class="loginCard"
    autocomplete="off"
>

<img
    src="/brand/logo-primary.jpg"
    class="loginLogo"
    alt="Sri Ganapathy Andhra's Ruchulu"
>

<p class="eyebrow">
    SECURE COUNTER ACCESS
</p>

<h1>
    Welcome back
</h1>

<p class="loginSub">
    Sign in to billing, orders,
    kitchen and branch operations.
</p>

<label>

Username

<input
    id="loginUser"
    autocomplete="off"
    autocapitalize="none"
    spellcheck="false"
    required
>

</label>

<label>

Password

<div class="password">

<input
    id="loginPass"
    type="password"
    autocomplete="new-password"
    required
>

<button
    type="button"
    id="showPass"
>
    Show
</button>

</div>

</label>

<div
    id="loginError"
    class="loginError"
></div>

<button
    class="loginSubmit"
>
    Sign in
</button>

<small class="secureNote">
    Live production account ·
    no demo credentials
</small>

</form>

</div>

</div>
`;

    $("#showPass").onclick =
        () => {

            const input =
                $("#loginPass");

            input.type =
                input.type ===
                "password"
                    ? "text"
                    : "password";

            $("#showPass")
                .textContent =
                    input.type ===
                    "password"
                        ? "Show"
                        : "Hide";
        };

    $("#loginForm").onsubmit =
        async event => {

            event.preventDefault();

            const button =
                $(".loginSubmit");

            setBusy(
                button,
                true,
                "Signing in…"
            );

            try {

                const data =
                    await api(
                        "/api/auth/login",
                        {
                            method: "POST",

                            body:
                                JSON.stringify({

                                    username:
                                        $("#loginUser")
                                            .value
                                            .trim(),

                                    password:
                                        $("#loginPass")
                                            .value
                                })
                        }
                    );

                if (!data.user)
                    throw Error(
                        "Login failed"
                    );

                location.replace('/pos/?v=' + Date.now());

            } catch (error) {

                $("#loginError")
                    .textContent =
                    error.message;

                setBusy(
                    button,
                    false
                );
            }
        };
}

/* ============================================================
   INIT
   ============================================================ */

async function init() {

    try {

        const response =
            await fetch(
                "/api/me",
                {
                    credentials:
                        "include",

                    cache:
                        "no-store"
                }
            );

        if (
            response.status ===
            401
        ) {

            return login();
        }

        if (!response.ok)
            throw Error(
                "Session verification failed"
            );

        const data =
            await response.json();

        state.user =
            data.user;

        if (!state.user)
            return login();

        state.branches =
            await api(
                "/api/branches"
            );

        const slug =
            pathBranch();

        state.branch =
            slug
                ? state.branches.find(
                    branch =>
                        branch.slug ===
                        slug
                )
                : state.branches.find(
                    branch =>
                        branch.id ===
                        state.user.branchId
                ) ||
                state.branches[0];

        if (!state.branch)
            throw Error(
                "No branch assigned to this account"
            );

        await loadBranchData();

        renderShell();

        renderPage();

        connectRealtime();

    } catch (error) {

        console.error(error);

        login();
    }
}

/* ============================================================
   GLOBAL HANDLERS
   ============================================================ */

window.addItem = addItem;
window.changeQty = changeQty;
window.clearCart = clearCart;
window.newBill = newBill;
window.holdOrder = holdOrder;
window.placeOrder = placeOrder;
window.setPayment = payment => {
    state.payment = payment;
    renderCart();
};
window.setCategory = setCategory;
window.setOrderType = setOrderType;
window.refreshData = refreshData;
window.openBill = openBill;
window.orderActions = orderActions;
window.setStatus = setStatus;
window.menuModal = menuModal;
window.saveMenu = saveMenu;
window.expenseModal = expenseModal;
window.saveExpense = saveExpense;
window.printerModal = printerModal;
window.savePrinter = savePrinter;
window.benchModal = benchModal;
window.saveBench = saveBench;
window.settingsModal = settingsModal;
window.saveSettings = saveSettings;
window.staffModal = staffModal;
window.saveStaff = saveStaff;
window.resetUser = resetUser;
window.branchModal = branchModal;
window.saveBranch = saveBranch;
window.editBranch = editBranch;
window.saveBranchSettings = saveBranchSettings;
window.switchBranch = switchBranch;
window.branchQR = branchQR;
window.closeModal = closeModal;
window.openShortcut = openShortcut;
window.queuePrint = queuePrint;


/* ============================================================
   SGAR FINAL LOGIN OVERRIDE
   ============================================================ */

async function login(){

  let target = null;

  const slug =
    typeof pathBranch === "function"
      ? pathBranch()
      : null;

  if(slug){

    try{

      target =
        await api(
          "/api/public/branch/" +
          encodeURIComponent(slug)
        );

    }catch{}

  }


  document.body.innerHTML = `

    <div class="loginScreen">

      <section class="loginVisual">

        <div class="loginVisualInner">

          <img
            class="loginBrandLogo"
            src="/brand/logo-primary.jpg?v=8"
            alt="Sri Ganapathy Andhra's Ruchulu"
          >

          <div
            class="loginAnim"
            aria-label="Sri Ganapathy Andhra's Ruchulu six frame animation"
          ></div>

          <div class="loginCaption">
            ${esc(
              target?.name ||
              "Sri Ganapathy Andhra's Ruchulu"
            )}
          </div>

          <span>
            LIVE PRODUCTION POS · BILLING · ORDERS · KITCHEN
          </span>

        </div>

      </section>


      <section class="loginPane">

        <form
          id="loginForm"
          class="loginCard"
          autocomplete="off"
        >

          <div class="loginCardBrand">

            <img
              src="/brand/logo-icon.jpg?v=8"
              alt=""
            >

            <span>
              SRI GANAPATHY · ANDHRA'S RUCHULU
            </span>

          </div>


          <p class="eyebrow">
            SECURE COUNTER ACCESS
          </p>


          <h1>
            Welcome back
          </h1>


          <p class="loginSub">
            Sign in to access billing, orders,
            kitchen operations and branch management.
          </p>


          ${
            target
              ? `
                <div class="loginBranchLock">
                  Branch access ·
                  <b>${esc(target.name)}</b>
                </div>
              `
              : ""
          }


          <label>

            Username

            <input
              id="loginUser"
              name="sgar_account"
              type="text"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              data-lpignore="true"
              data-1p-ignore="true"
              required
            >

          </label>


          <label>

            Password

            <div class="password">

              <input
                id="loginPass"
                name="sgar_secret"
                type="password"
                autocomplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                required
              >

              <button
                type="button"
                id="showPass"
              >
                Show
              </button>

            </div>

          </label>


          <div
            id="loginError"
            class="loginError"
          ></div>


          <button
            class="loginSubmit"
            type="submit"
          >
            SIGN IN
          </button>


          <small class="secureNote">
            Authenticated production account · branch access controlled
          </small>

        </form>

      </section>

    </div>

  `;


  $("#showPass").onclick = () => {

    const input =
      $("#loginPass");

    input.type =
      input.type === "password"
        ? "text"
        : "password";

    $("#showPass").textContent =
      input.type === "password"
        ? "Show"
        : "Hide";

  };


  setTimeout(
    () => $("#loginUser")?.focus(),
    150
  );


  $("#loginForm").onsubmit =
    async event => {

      event.preventDefault();

      const button =
        $(".loginSubmit");

      try{

        setBusy(
          button,
          true,
          "SIGNING IN..."
        );


        const result =
          await api(
            "/api/auth/login",
            {
              method:"POST",

              body:JSON.stringify({

                username:
                  $("#loginUser")
                    .value
                    .trim(),

                password:
                  $("#loginPass")
                    .value,

                branchId:
                  target?.id

              })

            }
          );


        if(!result?.user){

          throw new Error(
            "Invalid username or password"
          );

        }


        location.replace(
          "/pos/?v=" +
          Date.now()
        );


      }catch(error){

        console.error(error);

        $("#loginError").textContent =
          error?.message ||
          "Unable to sign in";


        setBusy(
          button,
          false
        );

      }

    };

}


/* ============================================================
   SGAR FINAL  DASHBOARD
   ============================================================ */

async function sgarSuperAdminDashboard(){

  if(
    !state?.user ||
    state.user.role !== "SUPER_ADMIN"
  ){

    return;

  }


  const main =
    document.querySelector("#main");

  if(!main){

    return;

  }


  let rows = [];

  try{

    rows =
      await api(
        "/api/dashboard/all"
      );

  }catch(error){

    console.error(
      "Super Admin dashboard:",
      error
    );

  }


  rows =
    Array.isArray(rows)
      ? rows
      : [];


  const totalSales =
    rows.reduce(
      (sum,item) =>
        sum +
        Number(item.sales || 0),
      0
    );


  const totalOrders =
    rows.reduce(
      (sum,item) =>
        sum +
        Number(item.orders || 0),
      0
    );


  const totalPending =
    rows.reduce(
      (sum,item) =>
        sum +
        Number(item.pending || 0),
      0
    );


  const totalQR =
    rows.reduce(
      (sum,item) =>
        sum +
        Number(item.qrOrders || 0),
      0
    );


  let topItems = [];


  try{

    const sets =
      await Promise.all(
        rows.map(
          item =>
            api(
              "/api/dashboard/items?branchId=" +
              encodeURIComponent(
                item.branch.id
              )
            ).catch(
              () => []
            )
        )
      );


    const itemMap = {};


    sets
      .flat()
      .forEach(
        item => {

          const name =
            item?.name ||
            "";

          itemMap[name] =
            (
              itemMap[name] ||
              0
            ) +
            Number(
              item?.quantity ||
              0
            );

        }
      );


    topItems =
      Object.entries(itemMap)
        .sort(
          (a,b) =>
            Number(b[1]) -
            Number(a[1])
        )
        .slice(0,10);

  }catch{}


  main.innerHTML = `

    <div class="sgarSuperDashboard">


      <section class="sgarHero">

        <div>

          <div
            style="
              font-size:9px;
              font-weight:900;
              letter-spacing:2px;
              color:#d4a017;
            "
          >
            SRI GANAPATHY ANDHRA'S RUCHULU
          </div>

          <h1>
            
          </h1>

          <p>
            All branches · today's live operational overview
          </p>

        </div>


        <div class="sgarHeroBadge">
          
        </div>

      </section>


      <section class="sgarStats">


        <div class="sgarStat">

          <small>
            Total Sales Today
          </small>

          <strong>
            ${money(totalSales)}
          </strong>

        </div>


        <div class="sgarStat">

          <small>
            Total Orders
          </small>

          <strong>
            ${totalOrders}
          </strong>

        </div>


        <div class="sgarStat">

          <small>
            Pending Orders
          </small>

          <strong>
            ${totalPending}
          </strong>

        </div>


        <div class="sgarStat">

          <small>
            QR Orders
          </small>

          <strong>
            ${totalQR}
          </strong>

        </div>


      </section>


      <section class="sgarDashboardGrid">


        <div class="sgarPanel">

          <div class="sgarPanelHeader">

            <h3>
              Branch Network
            </h3>

            <span>
              ${rows.length}
              branch${rows.length === 1 ? "" : "es"}
            </span>

          </div>


          ${
            rows.length
              ? rows.map(
                  item => {

                    const branch =
                      item.branch || {};

                    return `

                      <article
                        class="sgarBranch"
                      >

                        <div
                          class="sgarBranchTop"
                        >

                          <div>

                            <div
                              class="sgarBranchName"
                            >
                              ${esc(
                                branch.name ||
                                "Unnamed Branch"
                              )}
                            </div>

                            <span
                              class="sgarBranchCode"
                            >
                              ${esc(
                                branch.code ||
                                "—"
                              )}
                            </span>

                          </div>


                          <span
                            class="sgarBranchStatus"
                          >
                            ${
                              branch.active === false
                                ? "OFFLINE"
                                : "ACTIVE"
                            }
                          </span>

                        </div>


                        <div
                          class="sgarBranchMetrics"
                        >

                          <div
                            class="sgarBranchMetric"
                          >

                            <small>
                              SALES
                            </small>

                            <b>
                              ${money(
                                item.sales || 0
                              )}
                            </b>

                          </div>


                          <div
                            class="sgarBranchMetric"
                          >

                            <small>
                              ORDERS
                            </small>

                            <b>
                              ${Number(
                                item.orders || 0
                              )}
                            </b>

                          </div>


                          <div
                            class="sgarBranchMetric"
                          >

                            <small>
                              PENDING
                            </small>

                            <b>
                              ${Number(
                                item.pending || 0
                              )}
                            </b>

                          </div>


                          <div
                            class="sgarBranchMetric"
                          >

                            <small>
                              QR
                            </small>

                            <b>
                              ${Number(
                                item.qrOrders || 0
                              )}
                            </b>

                          </div>

                        </div>


                        <div
                          class="sgarActions"
                        >

                          <button
                            class="sgarAction primary"
                            onclick="
                              switchBranch(
                                '${String(
                                  branch.id || ""
                                ).replace(
                                  /'/g,
                                  "\\'"
                                )}'
                              )
                            "
                          >
                            Open Branch
                          </button>


                          <button
                            class="sgarAction"
                            onclick="
                              branchQR(
                                '${String(
                                  branch.id || ""
                                ).replace(
                                  /'/g,
                                  "\\'"
                                )}'
                              )
                            "
                          >
                            Real QR
                          </button>


                          <button
                            class="sgarAction"
                            onclick="
                              branchModal(
                                '${String(
                                  branch.id || ""
                                ).replace(
                                  /'/g,
                                  "\\'"
                                )}'
                              )
                            "
                          >
                            Manage
                          </button>

                        </div>


                      </article>

                    `;

                  }
                ).join("")
              : `
                <div class="sgarEmpty">

                  No branches returned from
                  the production API.

                  <br><br>

                  Use
                  <b>Create Branch</b>
                  to add the first branch.

                </div>
              `
          }

        </div>


        <div>


          <div class="sgarPanel">

            <div class="sgarPanelHeader">

              <h3>
                Top Selling Items
              </h3>

              <span>
                Quantity
              </span>

            </div>


            ${
              topItems.length
                ? topItems.map(
                    ([name,quantity]) => `

                      <div
                        class="sgarTopItem"
                      >

                        <span>
                          ${esc(name)}
                        </span>

                        <b>
                          ${Number(quantity)}
                        </b>

                      </div>

                    `
                  ).join("")
                : `
                  <div class="sgarEmpty">
                    No item sales available yet.
                  </div>
                `
            }

          </div>


          <div
            class="sgarPanel"
            style="margin-top:16px"
          >

            <div class="sgarPanelHeader">

              <h3>
                
              </h3>

            </div>


            <div
              style="
                padding:16px;
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:9px;
              "
            >

              <button
                class="sgarAction primary"
                onclick="
                  branchModal()
                "
              >
                + Create Branch
              </button>


              <button
                class="sgarAction"
                onclick="
                  if(typeof renderPage==='function')
                    renderPage()
                "
              >
                Refresh
              </button>


              <button
                class="sgarAction"
                onclick="
                  state.page='billing';
                  renderShell();
                  renderPage();
                "
              >
                Counter Billing
              </button>


              <button
                class="sgarAction"
                onclick="
                  location.replace('/pos/?v=' + Date.now())
                "
              >
                Reload POS
              </button>

            </div>

          </div>


        </div>


      </section>

    </div>

  `;

}


/* ============================================================
    FLOATING CONTROL
   ============================================================ */

function sgarInstallSuperAdminButton(){

  if(
    !state?.user ||
    state.user.role !== "SUPER_ADMIN"
  ){

    return;

  }


  if(
    document.querySelector(
      "#sgarSuperAdminButton"
    )
  ){

    return;

  }


  const button =
    document.createElement(
      "button"
    );


  button.id =
    "sgarSuperAdminButton";

  button.className =
    "sgarAdminButton";

  button.textContent =
    "";

  button.onclick =
    () =>
      sgarSuperAdminDashboard();


  document.body.appendChild(
    button
  );

}


/* ============================================================
    BOOT
   ============================================================ */

let sgarSuperAdminStarted = false;

setInterval(
  () => {

    if(
      !sgarSuperAdminStarted &&
      state?.user?.role ===
        "SUPER_ADMIN" &&
      document.querySelector(
        "#main"
      )
    ){

      sgarSuperAdminStarted = true;

      sgarInstallSuperAdminButton();

      setTimeout(
        () =>
          sgarSuperAdminDashboard(),
        250
      );

    }

  },
  500
);

init();












