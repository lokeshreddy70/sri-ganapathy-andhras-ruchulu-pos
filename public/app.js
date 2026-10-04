/* SGAR_AUTH_ENDPOINT_FIX_20261005 */
(() => {

"use strict";

const $ = id =>
  document.getElementById(id);

const S = {

  user: null,

  branch: null,

  branches: [],

  menu: [],

  benches: [],

  users: [],

  printers: [],

  orders: [],

  held: [],

  dashboard: null,

  view: "dashboard",

  cart: [],

  category: "ALL",

  search: "",

  date:
    new Date()
      .toISOString()
      .slice(0,10)

};

function esc(value){

  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

}

function money(value){

  return "₹" +
    Number(value || 0)
      .toFixed(2);

}

function initials(name){

  return String(name || "U")
    .trim()
    .split(/\s+/)
    .slice(0,2)
    .map(x => x[0])
    .join("")
    .toUpperCase();

}

function isAdmin(){

  return [
    "SUPER_ADMIN",
    "ADMIN",
    "MANAGER"
  ].includes(
    S.user?.role
  );

}

function isSuperAdmin(){

  return S.user?.role ===
    "SUPER_ADMIN";

}

function toast(
  message,
  type = "success"
){

  const el =
    document.createElement("div");

  el.className =
    "toast " + type;

  el.textContent =
    message;

  $("toast")
    .appendChild(el);

  setTimeout(
    () => el.remove(),
    3000
  );

}

async function api(
  url,
  options = {}
){

  const response =
    await fetch(
      url,
      {
        credentials:"include",
        cache:"no-store",

        headers:{
          ...(options.body
            ? {
                "Content-Type":
                  "application/json"
              }
            : {}),

          ...(options.headers || {})
        },

        ...options
      }
    );

  let data = null;

  try{
    data =
      await response.json();
  }catch{}

  if(!response.ok){

    throw new Error(
      data?.error ||
      `Request failed (${response.status})`
    );

  }

  return data;

}

/* =========================================================
   AUTH
========================================================= */

async function loadMe(){

  try{

    const data =
      await api("/api/me");

    S.user =
      data.user;

    return true;

  }catch{

    return false;

  }

}

async function logout(){

  try{

    await api(
      "/api/auth/logout",
      {
        method:"POST"
      }
    );

  }catch{}

  location.reload();

}

/* =========================================================
   DATA
========================================================= */

async function loadBranches(){

  S.branches =
    await api("/api/branches");

  const previous =
    S.branch?.id;

  S.branch =
    S.branches.find(
      x => x.id === previous
    ) ||

    S.branches.find(
      x =>
        x.id ===
        S.user?.branchId
    ) ||

    S.branches[0] ||

    null;

  $("branchSelect").innerHTML =
    S.branches
      .map(
        branch => `
          <option
            value="${esc(branch.id)}"
            ${
              branch.id === S.branch?.id
                ? "selected"
                : ""
            }
          >
            ${esc(branch.name)}
          </option>
        `
      )
      .join("");

  $("branchSelect").disabled =
    !isSuperAdmin();

}

async function loadMenu(){

  if(!S.branch) return;

  S.menu =
    await api(
      `/api/menu?branchId=${encodeURIComponent(S.branch.id)}`
    );

}

async function loadBenches(){

  if(!S.branch) return;

  S.benches =
    await api(
      `/api/benches?branchId=${encodeURIComponent(S.branch.id)}`
    );

}

async function loadOrders(){

  if(!S.branch) return;

  S.orders =
    await api(
      `/api/pos/orders?branchId=${encodeURIComponent(S.branch.id)}`
    );

}

async function loadHeld(){

  if(!S.branch) return;

  S.held =
    await api(
      `/api/held-bills?branchId=${encodeURIComponent(S.branch.id)}`
    );

}

async function loadUsers(){

  if(!S.branch || !isAdmin())
    return;

  try{

    S.users =
      await api(
        `/api/users?branchId=${encodeURIComponent(S.branch.id)}`
      );

  }catch{

    S.users = [];

  }

}

async function loadPrinters(){

  if(!S.branch || !isAdmin())
    return;

  try{

    S.printers =
      await api(
        `/api/printers?branchId=${encodeURIComponent(S.branch.id)}`
      );

  }catch{

    S.printers = [];

  }

}

async function loadDashboard(){

  if(!S.branch) return;

  S.dashboard =
    await api(
      `/api/reports/daily-sales?branchId=${encodeURIComponent(S.branch.id)}&date=${S.date}`
    );

}

async function loadAll(){

  await loadBranches();

  await Promise.all([
    loadMenu(),
    loadBenches(),
    loadOrders(),
    loadHeld(),
    loadUsers(),
    loadPrinters(),
    loadDashboard()
  ]);

}

/* =========================================================
   NAV
========================================================= */

function setView(view){

  S.view =
    view;

  document
    .querySelectorAll(
      "#nav button"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.view === view
      );

    });

  render();

}

function setHeader(
  title,
  subtitle
){

  $("title").textContent =
    title;

  $("subtitle").textContent =
    subtitle;

  $("userName").textContent =
    S.user?.name || "User";

  $("userRole").textContent =
    S.user?.role || "";

  $("avatar").textContent =
    initials(
      S.user?.name
    );

  document
    .querySelectorAll(
      ".adminOnly"
    )
    .forEach(
      el =>
        el.classList.toggle(
          "hidden",
          !isAdmin()
        )
    );

  document
    .querySelectorAll(
      ".superOnly"
    )
    .forEach(
      el =>
        el.classList.toggle(
          "hidden",
          !isSuperAdmin()
        )
    );

}

/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard(){

  const d =
    S.dashboard || {};

  const recent =
    S.orders.slice(0,10);

  const items =
    d.items || [];

  return `

    <div class="head">

      <div>
        <h1>Dashboard</h1>
        <p>
          ${esc(S.branch?.name || "")}
        </p>
      </div>

      <button
        class="secondary"
        data-action="refresh"
      >
        Refresh
      </button>

    </div>

    <div class="stats">

      ${[
        ["Sales", money(d.totalSales)],
        ["Bills", d.orders || 0],
        ["Cash", money(d.cash)],
        ["UPI", money(d.upi)],
        ["Card", money(d.card)],
        ["QR Orders", d.qrOrders || 0]
      ]
      .map(
        item => `
          <div class="stat">
            <small>
              ${item[0]}
            </small>
            <b>
              ${item[1]}
            </b>
          </div>
        `
      )
      .join("")}

    </div>

    <div class="cols">

      <div class="panel">

        <div class="panel-head">
          <b>Recent Bills</b>

          <button
            class="link"
            data-view="sales"
          >
            View all
          </button>
        </div>

        ${
          recent.length

          ? recent.map(
              order => `
                <button
                  class="row"
                  data-order="${esc(order.id)}"
                >

                  <span>

                    <b>
                      ${esc(
                        order.invoiceNumber ||
                        "#" + order.number
                      )}
                    </b>

                    <small>
                      ${new Date(
                        order.createdAt
                      ).toLocaleString("en-IN")}
                    </small>

                  </span>

                  <strong>
                    ${money(order.total)}
                  </strong>

                </button>
              `
            ).join("")

          : `
            <div class="empty">
              No bills today.
            </div>
          `
        }

      </div>

      <div class="panel">

        <div class="panel-head">
          <b>Top Items</b>
        </div>

        ${
          items.length

          ? items.slice(0,10).map(
              item => `
                <div class="row">

                  <span>

                    <b>
                      ${esc(item.name)}
                    </b>

                    <small>
                      ${item.quantity} sold
                    </small>

                  </span>

                  <strong>
                    ${money(item.amount)}
                  </strong>

                </div>
              `
            ).join("")

          : `
            <div class="empty">
              No item sales.
            </div>
          `
        }

      </div>

    </div>

  `;

}

/* =========================================================
   BILLING
========================================================= */

function menuCategories(){

  return [
    "ALL",
    ...new Set(
      S.menu
        .map(
          item =>
            item.category
        )
        .filter(Boolean)
    )
  ];

}

function addCart(item){

  if(
    !item ||
    !item.active ||
    item.soldOut
  ){

    toast(
      "Item is not available",
      "error"
    );

    return;

  }

  const existing =
    S.cart.find(
      x => x.id === item.id
    );

  if(existing){

    existing.qty += 1;

  }else{

    S.cart.push({
      id:item.id,
      name:item.name,
      price:Number(item.price),
      qty:1
    });

  }

  render();

}

function cartTotal(){

  return S.cart.reduce(
    (sum,item) =>
      sum +
      item.price *
      item.qty,
    0
  );

}

function renderBilling(){

  const items =
    S.menu.filter(
      item => {

        if(
          S.category !== "ALL" &&
          item.category !==
            S.category
        )
          return false;

        if(
          S.search &&
          !item.name
            .toLowerCase()
            .includes(
              S.search.toLowerCase()
            )
        )
          return false;

        return true;

      }
    );

  const subtotal =
    cartTotal();

  const taxRate =
    S.branch?.taxEnabled
      ? Number(
          S.branch.taxRate || 0
        )
      : 0;

  const tax =
    subtotal *
    taxRate /
    100;

  const total =
    subtotal + tax;

  return `

    <div class="bill-layout">

      <section>

        <div class="head">

          <div>

            <h1>Billing</h1>

            <p>
              Fast billing · no fake images
            </p>

          </div>

          <input
            id="search"
            class="search"
            placeholder="Search menu"
            value="${esc(S.search)}"
          >

        </div>

        <div class="cats">

          ${
            menuCategories()
              .map(
                category => `
                  <button
                    class="cat ${
                      S.category === category
                        ? "active"
                        : ""
                    }"
                    data-cat="${esc(category)}"
                  >
                    ${esc(category)}
                  </button>
                `
              )
              .join("")
          }

        </div>

        <div class="menu-grid">

          ${
            items.length

            ? items.map(
                item => `
                  <button
                    class="item ${
                      item.soldOut
                        ? "sold"
                        : ""
                    }"
                    data-add="${esc(item.id)}"
                    ${
                      item.soldOut ||
                      !item.active
                        ? "disabled"
                        : ""
                    }
                  >

                    <b>
                      ${esc(item.name)}
                    </b>

                    <small>
                      ${esc(item.category)}
                    </small>

                    <strong>
                      ${money(item.price)}
                    </strong>

                    ${
                      item.soldOut
                        ? `
                          <em>
                            SOLD OUT
                          </em>
                        `
                        : ""
                    }

                  </button>
                `
              ).join("")

            : `
              <div class="empty">
                No menu items.
              </div>
            `
          }

        </div>

      </section>

      <aside class="bill">

        <div class="panel-head">

          <b>
            Current Bill
          </b>

          <button
            class="icon"
            data-action="clear"
          >
            ×
          </button>

        </div>

        <div class="fields">

          <select id="location">

            <option value="">
              Counter
            </option>

            ${
              S.benches
                .filter(
                  x => x.active
                )
                .map(
                  x => `
                    <option value="${esc(x.id)}">
                      ${esc(x.label)}
                    </option>
                  `
                )
                .join("")
            }

          </select>

          <input
            id="custom"
            placeholder="Custom location"
          >

          <input
            id="customer"
            placeholder="Customer name"
          >

          <input
            id="phone"
            placeholder="Customer phone"
          >

        </div>

        <div class="cart">

          ${
            S.cart.length

            ? S.cart.map(
                item => `
                  <div class="cart-row">

                    <span>

                      <b>
                        ${esc(item.name)}
                      </b>

                      <small>
                        ${money(item.price)}
                      </small>

                    </span>

                    <div class="qty">

                      <button
                        data-qty="-1"
                        data-id="${esc(item.id)}"
                      >
                        −
                      </button>

                      <b>
                        ${item.qty}
                      </b>

                      <button
                        data-qty="1"
                        data-id="${esc(item.id)}"
                      >
                        +
                      </button>

                    </div>

                    <strong>
                      ${money(
                        item.price *
                        item.qty
                      )}
                    </strong>

                  </div>
                `
              ).join("")

            : `
              <div class="empty">
                Add items from menu.
              </div>
            `
          }

        </div>

        <div class="summary">

          <div>
            <span>Subtotal</span>
            <b>
              ${money(subtotal)}
            </b>
          </div>

          <div>
            <span>Tax</span>
            <b>
              ${money(tax)}
            </b>
          </div>

          <div class="total">

            <span>TOTAL</span>

            <b>
              ${money(total)}
            </b>

          </div>

        </div>

        <div class="pay">

          <button
            class="hold"
            data-action="hold"
          >
            Hold
          </button>

          <button data-pay="CASH">
            Cash
          </button>

          <button data-pay="UPI">
            UPI
          </button>

          <button data-pay="CARD">
            Card
          </button>

        </div>

      </aside>

    </div>

  `;

}

/* =========================================================
   SALES
========================================================= */

function renderSales(){

  const rows =
    S.orders.filter(
      order =>
        String(
          order.createdAt
        ).slice(0,10) ===
        S.date
    );

  return `

    <div class="head">

      <div>

        <h1>Sales</h1>

        <p>
          Previous sales and bills
        </p>

      </div>

      <input
        type="date"
        id="date"
        value="${S.date}"
      >

    </div>

    <div class="panel table">

      <table>

        <thead>

          <tr>
            <th>Invoice</th>
            <th>Date</th>
            <th>Location</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Total</th>
            <th></th>
          </tr>

        </thead>

        <tbody>

          ${
            rows.map(
              order => `
                <tr>

                  <td>
                    <b>
                      ${esc(
                        order.invoiceNumber ||
                        "#" + order.number
                      )}
                    </b>
                  </td>

                  <td>
                    ${new Date(
                      order.createdAt
                    ).toLocaleString("en-IN")}
                  </td>

                  <td>
                    ${esc(
                      order.bench?.label ||
                      "Counter"
                    )}
                  </td>

                  <td>
                    ${esc(
                      order.paymentMethod ||
                      "-"
                    )}
                  </td>

                  <td>
                    ${esc(order.status)}
                  </td>

                  <td>
                    <b>
                      ${money(order.total)}
                    </b>
                  </td>

                  <td>
                    <button
                      class="small"
                      data-order="${esc(order.id)}"
                    >
                      View
                    </button>
                  </td>

                </tr>
              `
            ).join("")
          }

        </tbody>

      </table>

    </div>

  `;

}

/* =========================================================
   REPORTS
========================================================= */

function renderReports(){

  const d =
    S.dashboard || {};

  return `

    <div class="head">

      <div>

        <h1>Reports</h1>

        <p>
          Real database reports
        </p>

      </div>

      <input
        type="date"
        id="reportDate"
        value="${S.date}"
      >

    </div>

    <div class="stats">

      ${[
        ["Total Sales",money(d.totalSales)],
        ["Bills",d.orders || 0],
        ["Cash",money(d.cash)],
        ["UPI",money(d.upi)],
        ["Card",money(d.card)],
        ["Pending",d.pending || 0]
      ]
      .map(
        x => `
          <div class="stat">
            <small>${x[0]}</small>
            <b>${x[1]}</b>
          </div>
        `
      )
      .join("")}

    </div>

    <div class="panel table">

      <table>

        <thead>

          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>Amount</th>
          </tr>

        </thead>

        <tbody>

          ${
            (d.items || [])
              .map(
                item => `
                  <tr>

                    <td>
                      ${esc(item.name)}
                    </td>

                    <td>
                      ${item.quantity}
                    </td>

                    <td>
                      ${money(item.amount)}
                    </td>

                  </tr>
                `
              )
              .join("")
          }

        </tbody>

      </table>

    </div>

  `;

}

/* =========================================================
   KOT
========================================================= */

function renderKot(){

  const active =
    S.orders.filter(
      order =>
        ![
          "COMPLETED",
          "CANCELLED"
        ].includes(
          order.status
        )
    );

  const count =
    active.length;

  $("kotCount").textContent =
    count || "";

  return `

    <div class="head">

      <div>

        <h1>KOT</h1>

        <p>
          Live kitchen queue · 5 second sync
        </p>

      </div>

      <button
        class="secondary"
        data-action="refresh"
      >
        Refresh
      </button>

    </div>

    <div class="kot-grid">

      ${
        active.length

        ? active.map(
            order => `
              <article class="kot">

                <header>

                  <b>
                    KOT #${order.number}
                  </b>

                  <span>
                    ${esc(
                      order.bench?.label ||
                      "Counter"
                    )}

                    ·

                    ${esc(
                      order.status
                    )}
                  </span>

                </header>

                <div>

                  ${
                    (order.lines || [])
                      .map(
                        line => `
                          <p>
                            <b>
                              ${line.quantity}
                              ×
                              ${esc(
                                line.menuItem?.name ||
                                ""
                              )}
                            </b>
                          </p>
                        `
                      )
                      .join("")
                  }

                </div>

                <footer>

                  ${
                    order.status ===
                    "ACCEPTED"

                    ? `
                      <button
                        data-status="PREPARING"
                        data-order-status="${esc(order.id)}"
                      >
                        Preparing
                      </button>
                    `

                    : ""
                  }

                  ${
                    order.status ===
                    "PREPARING"

                    ? `
                      <button
                        data-status="READY"
                        data-order-status="${esc(order.id)}"
                      >
                        Ready
                      </button>
                    `

                    : ""
                  }

                  ${
                    order.status ===
                    "READY"

                    ? `
                      <button
                        data-status="SERVED"
                        data-order-status="${esc(order.id)}"
                      >
                        Served
                      </button>
                    `

                    : ""
                  }

                  ${
                    order.status ===
                    "SERVED"

                    ? `
                      <button
                        data-status="COMPLETED"
                        data-order-status="${esc(order.id)}"
                      >
                        Complete
                      </button>
                    `

                    : ""
                  }

                </footer>

              </article>
            `
          ).join("")

        : `
          <div class="empty">
            No active KOTs.
          </div>
        `
      }

    </div>

  `;

}

/* =========================================================
   MENU
========================================================= */

function renderMenu(){

  return `

    <div class="head">

      <div>

        <h1>Menu</h1>

        <p>
          Real CRUD · historical items are archived
        </p>

      </div>

      ${
        isAdmin()
        ? `
          <button
            class="primary"
            data-new="menu"
          >
            Add Item
          </button>
        `
        : ""
      }

    </div>

    <div class="panel table">

      <table>

        <thead>

          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Price</th>
            <th>Status</th>
            <th></th>
          </tr>

        </thead>

        <tbody>

          ${
            S.menu.map(
              item => `
                <tr>

                  <td>
                    <b>
                      ${esc(item.name)}
                    </b>
                  </td>

                  <td>
                    ${esc(item.category)}
                  </td>

                  <td>
                    ${money(item.price)}
                  </td>

                  <td>
                    ${
                      item.soldOut
                      ? "Sold Out"
                      : item.active
                      ? "Active"
                      : "Disabled"
                    }
                  </td>

                  <td>

                    ${
                      isAdmin()

                      ? `
                        <button
                          class="small"
                          data-edit-menu="${esc(item.id)}"
                        >
                          Edit
                        </button>

                        <button
                          class="small"
                          data-toggle-menu="${esc(item.id)}"
                        >
                          ${
                            item.soldOut
                            ? "Available"
                            : "Sold Out"
                          }
                        </button>

                        <button
                          class="small danger"
                          data-delete-menu="${esc(item.id)}"
                        >
                          Delete
                        </button>
                      `

                      : ""
                    }

                  </td>

                </tr>
              `
            ).join("")
          }

        </tbody>

      </table>

    </div>

  `;

}

/* =========================================================
   TABLES
========================================================= */

function renderTables(){

  return `

    <div class="head">

      <div>

        <h1>Tables</h1>

        <p>
          Tables, counters and custom locations
        </p>

      </div>

      ${
        isAdmin()
        ? `
          <button
            class="primary"
            data-new="bench"
          >
            Add Location
          </button>
        `
        : ""
      }

    </div>

    <div class="locations">

      ${
        S.benches.map(
          bench => `
            <button
              class="location ${
                bench.active
                ? ""
                : "inactive"
              }"
              data-edit-bench="${esc(bench.id)}"
            >

              <b>
                ${esc(bench.label)}
              </b>

              <small>
                ${
                  bench.active
                  ? "Active"
                  : "Disabled"
                }
              </small>

            </button>
          `
        ).join("")
      }

    </div>

  `;

}

/* =========================================================
   QR
========================================================= */

function renderQr(){

  return `

    <div class="head">

      <div>

        <h1>QR Ordering</h1>

        <p>
          Customer orders enter the same POS/KOT system
        </p>

      </div>

    </div>

    <div class="qr-grid">

      ${
        S.benches.map(
          bench => `
            <article class="qr">

              <img
                src="/api/qr/${encodeURIComponent(bench.token)}.png"
                alt="QR"
              >

              <b>
                ${esc(bench.label)}
              </b>

              <small>
                ${
                  bench.active
                  ? "Active"
                  : "Disabled"
                }
              </small>

              <button
                class="small"
                data-open-qr="${esc(bench.token)}"
              >
                Open
              </button>

            </article>
          `
        ).join("")
      }

    </div>

  `;

}

/* =========================================================
   STAFF
========================================================= */

function renderStaff(){

  return `

    <div class="head">

      <div>

        <h1>Staff</h1>

        <p>
          Credentials, roles and access
        </p>

      </div>

      <button
        class="primary"
        data-new="user"
      >
        Add Staff
      </button>

    </div>

    <div class="panel table">

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
            S.users.map(
              user => `
                <tr>

                  <td>
                    ${esc(user.name)}
                  </td>

                  <td>
                    ${esc(user.username)}
                  </td>

                  <td>
                    ${user.role}
                  </td>

                  <td>
                    ${esc(
                      user.branch?.name ||
                      "-"
                    )}
                  </td>

                  <td>
                    ${
                      user.active
                      ? "Active"
                      : "Disabled"
                    }
                  </td>

                  <td>

                    <button
                      class="small"
                      data-edit-user="${esc(user.id)}"
                    >
                      Edit
                    </button>

                    ${
                      user.id !== S.user?.id
                      ? `
                        <button
                          class="small danger"
                          data-disable-user="${esc(user.id)}"
                        >
                          Disable
                        </button>
                      `
                      : ""
                    }

                  </td>

                </tr>
              `
            ).join("")
          }

        </tbody>

      </table>

    </div>

  `;

}

/* =========================================================
   BRANCHES
========================================================= */

function renderBranches(){

  return `

    <div class="head">

      <div>

        <h1>Branches</h1>

        <p>
          Restaurant outlets
        </p>

      </div>

      <button
        class="primary"
        data-new="branch"
      >
        Add Branch
      </button>

    </div>

    <div class="branch-grid">

      ${
        S.branches.map(
          branch => `
            <article class="branch">

              <b>
                ${esc(branch.name)}
              </b>

              <small>
                ${esc(branch.code)}
              </small>

              <p>
                ${esc(
                  branch.address ||
                  ""
                )}
              </p>

              <span>
                ${
                  branch.active
                  ? "Active"
                  : "Disabled"
                }
              </span>

              <button
                class="small"
                data-edit-branch="${esc(branch.id)}"
              >
                Edit
              </button>

              ${
                branch.id !==
                S.branch?.id
                ? `
                  <button
                    class="small danger"
                    data-disable-branch="${esc(branch.id)}"
                  >
                    Disable
                  </button>
                `
                : ""
              }

            </article>
          `
        ).join("")
      }

    </div>

  `;

}

/* =========================================================
   PRINTERS
========================================================= */

function renderPrinters(){

  return `

    <div class="head">

      <div>

        <h1>Printers</h1>

        <p>
          Receipt and kitchen printers
        </p>

      </div>

      <button
        class="primary"
        data-new="printer"
      >
        Add Printer
      </button>

    </div>

    <div class="panel table">

      <table>

        <thead>

          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Connection</th>
            <th>Paper</th>
            <th>Status</th>
            <th></th>
          </tr>

        </thead>

        <tbody>

          ${
            S.printers.map(
              printer => `
                <tr>

                  <td>
                    ${esc(printer.name)}
                  </td>

                  <td>
                    ${esc(printer.type)}
                  </td>

                  <td>
                    ${esc(
                      printer.connection
                    )}
                  </td>

                  <td>
                    ${printer.paperWidth}mm
                  </td>

                  <td>
                    ${
                      printer.active
                      ? "Active"
                      : "Disabled"
                    }
                  </td>

                  <td>

                    <button
                      class="small"
                      data-edit-printer="${esc(printer.id)}"
                    >
                      Edit
                    </button>

                    <button
                      class="small danger"
                      data-disable-printer="${esc(printer.id)}"
                    >
                      Disable
                    </button>

                  </td>

                </tr>
              `
            ).join("")
          }

        </tbody>

      </table>

    </div>

  `;

}

/* =========================================================
   SETTINGS
========================================================= */

function renderSettings(){

  const b =
    S.branch || {};

  return `

    <div class="head">

      <div>

        <h1>Settings</h1>

        <p>
          All billing, receipt and payment settings
        </p>

      </div>

      <button
        class="primary"
        data-save-settings
      >
        Save
      </button>

    </div>

    <div class="settings">

      <div class="panel form">

        <h3>
          Restaurant
        </h3>

        <label>
          Name
          <input
            id="sn"
            value="${esc(b.name)}"
          >
        </label>

        <label>
          Code
          <input
            id="sc"
            value="${esc(b.code)}"
          >
        </label>

        <label>
          Address
          <input
            id="sa"
            value="${esc(b.address || "")}"
          >
        </label>

        <label>
          Phone
          <input
            id="sp"
            value="${esc(b.phone || "")}"
          >
        </label>

        <label>
          GSTIN
          <input
            id="sg"
            value="${esc(b.gstin || "")}"
          >
        </label>

        <label>
          FSSAI
          <input
            id="sf"
            value="${esc(b.fssai || "")}"
          >
        </label>

        <label>
          Invoice Prefix
          <input
            id="sip"
            value="${esc(
              b.invoicePrefix ||
              "INV"
            )}"
          >
        </label>

        <label>
          Invoice Title
          <input
            id="sit"
            value="${esc(
              b.invoiceTitle ||
              "TAX INVOICE"
            )}"
          >
        </label>

      </div>

      <div class="panel form">

        <h3>
          Tax & Receipt
        </h3>

        <label>
          <input
            id="ste"
            type="checkbox"
            ${
              b.taxEnabled
              ? "checked"
              : ""
            }
          >
          Enable GST
        </label>

        <label>
          Tax Rate %
          <input
            id="str"
            type="number"
            step="0.01"
            value="${esc(
              b.taxRate || 0
            )}"
          >
        </label>

        <label>
          Paper
          <select id="spw">

            <option
              value="58"
              ${
                Number(
                  b.receiptPaperWidth
                ) === 58
                ? "selected"
                : ""
              }
            >
              58mm
            </option>

            <option
              value="80"
              ${
                Number(
                  b.receiptPaperWidth
                ) === 80
                ? "selected"
                : ""
              }
            >
              80mm
            </option>

          </select>
        </label>

        <label>
          Receipt Header
          <input
            id="srh"
            value="${esc(
              b.receiptHeader || ""
            )}"
          >
        </label>

        <label>
          Receipt Footer
          <input
            id="srf"
            value="${esc(
              b.receiptFooter || ""
            )}"
          >
        </label>

      </div>

      <div class="panel form">

        <h3>
          UPI & Payments
        </h3>

        <label>
          UPI ID
          <input
            id="sui"
            value="${esc(
              b.upiId || ""
            )}"
          >
        </label>

        <label>
          UPI Name
          <input
            id="sun"
            value="${esc(
              b.upiName || ""
            )}"
          >
        </label>

        <label>
          <input
            id="pcash"
            type="checkbox"
            ${
              b.paymentCashEnabled !== false
              ? "checked"
              : ""
            }
          >
          Cash
        </label>

        <label>
          <input
            id="pupi"
            type="checkbox"
            ${
              b.paymentUpiEnabled !== false
              ? "checked"
              : ""
            }
          >
          UPI
        </label>

        <label>
          <input
            id="pcard"
            type="checkbox"
            ${
              b.paymentCardEnabled !== false
              ? "checked"
              : ""
            }
          >
          Card
        </label>

      </div>

    </div>

  `;

}

/* =========================================================
   MODALS
========================================================= */

function openModal(
  title,
  body,
  type
){

  $("modal").innerHTML = `

    <div class="backdrop">

      <div class="modal-card">

        <header>

          <b>
            ${title}
          </b>

          <button
            data-close
          >
            ×
          </button>

        </header>

        <div class="modal-body">

          ${body}

        </div>

        <footer>

          <button
            class="secondary"
            data-close
          >
            Cancel
          </button>

          ${
            type !== "none"
            ? `
              <button
                class="primary"
                data-modal-save="${type}"
              >
                Save
              </button>
            `
            : ""
          }

        </footer>

      </div>

    </div>

  `;

  $("modal")
    .classList.remove(
      "hidden"
    );

}

function closeModal(){

  $("modal")
    .classList.add(
      "hidden"
    );

  $("modal").innerHTML =
    "";

}

function menuModal(
  item = {}
){

  openModal(
    item.id
      ? "Edit Menu Item"
      : "Add Menu Item",

    `

      <input
        type="hidden"
        id="fid"
        value="${esc(item.id || "")}"
      >

      <label>
        Name
        <input
          id="fn"
          value="${esc(item.name || "")}"
          required
        >
      </label>

      <label>
        Category
        <input
          id="fc"
          value="${esc(
            item.category || ""
          )}"
          required
        >
      </label>

      <label>
        Price
        <input
          id="fp"
          type="number"
          step="0.01"
          value="${esc(
            item.price || ""
          )}"
          required
        >
      </label>

      <label>
        Tax %
        <input
          id="ft"
          type="number"
          step="0.01"
          value="${esc(
            item.taxRate || ""
          )}"
        >
      </label>

      <label>
        Barcode
        <input
          id="fb"
          value="${esc(
            item.barcode || ""
          )}"
        >
      </label>

    `,
    "menu"
  );

}

function userModal(
  user = {}
){

  openModal(
    user.id
      ? "Edit Staff"
      : "Add Staff",

    `

      <input
        type="hidden"
        id="fid"
        value="${esc(user.id || "")}"
      >

      <label>
        Name
        <input
          id="fn"
          value="${esc(
            user.name || ""
          )}"
          required
        >
      </label>

      <label>
        Username
        <input
          id="fu"
          value="${esc(
            user.username || ""
          )}"
          required
        >
      </label>

      <label>
        Password
        <input
          id="fpass"
          type="password"
          placeholder="${
            user.id
            ? "Leave blank to keep current"
            : ""
          }"
          ${
            user.id
            ? ""
            : "required"
          }
        >
      </label>

      <label>
        Role

        <select id="fr">

          ${
            [
              "ADMIN",
              "MANAGER",
              "CASHIER",
              "KITCHEN"
            ]
            .map(
              role => `
                <option
                  ${
                    user.role === role
                    ? "selected"
                    : ""
                  }
                >
                  ${role}
                </option>
              `
            )
            .join("")
          }

        </select>

      </label>

      <label>
        Branch

        <select id="fbranch">

          ${
            S.branches
              .map(
                branch => `
                  <option
                    value="${esc(branch.id)}"
                    ${
                      user.branchId ===
                      branch.id
                      ? "selected"
                      : ""
                    }
                  >
                    ${esc(branch.name)}
                  </option>
                `
              )
              .join("")
          }

        </select>

      </label>

      <label>

        <input
          id="fact"
          type="checkbox"
          ${
            user.active !== false
            ? "checked"
            : ""
          }
        >

        Active

      </label>

    `,
    "user"
  );

}

function branchModal(
  branch = {}
){

  openModal(
    branch.id
      ? "Edit Branch"
      : "Add Branch",

    `

      <input
        type="hidden"
        id="fid"
        value="${esc(
          branch.id || ""
        )}"
      >

      <label>
        Name
        <input
          id="fn"
          value="${esc(
            branch.name || ""
          )}"
          required
        >
      </label>

      <label>
        Code
        <input
          id="fc"
          value="${esc(
            branch.code || ""
          )}"
          required
        >
      </label>

      <label>
        Address
        <input
          id="fa"
          value="${esc(
            branch.address || ""
          )}"
        >
      </label>

      <label>
        Phone
        <input
          id="fph"
          value="${esc(
            branch.phone || ""
          )}"
        >
      </label>

      <label>
        GSTIN
        <input
          id="fg"
          value="${esc(
            branch.gstin || ""
          )}"
        >
      </label>

      <label>
        FSSAI
        <input
          id="ff"
          value="${esc(
            branch.fssai || ""
          )}"
        >
      </label>

      <label>
        Invoice Prefix
        <input
          id="fi"
          value="${esc(
            branch.invoicePrefix ||
            "INV"
          )}"
        >
      </label>

      <label>

        <input
          id="fact"
          type="checkbox"
          ${
            branch.active !== false
            ? "checked"
            : ""
          }
        >

        Active

      </label>

    `,
    "branch"
  );

}

function benchModal(
  bench = {}
){

  openModal(
    bench.id
      ? "Edit Location"
      : "Add Location",

    `

      <input
        type="hidden"
        id="fid"
        value="${esc(
          bench.id || ""
        )}"
      >

      <label>
        Location / Table
        <input
          id="fl"
          value="${esc(
            bench.label || ""
          )}"
          placeholder="Table 12 / Counter"
          required
        >
      </label>

      <label>

        <input
          id="fact"
          type="checkbox"
          ${
            bench.active !== false
            ? "checked"
            : ""
          }
        >

        Active

      </label>

    `,
    "bench"
  );

}

function printerModal(
  printer = {}
){

  openModal(
    printer.id
      ? "Edit Printer"
      : "Add Printer",

    `

      <input
        type="hidden"
        id="fid"
        value="${esc(
          printer.id || ""
        )}"
      >

      <label>
        Name
        <input
          id="fn"
          value="${esc(
            printer.name || ""
          )}"
          required
        >
      </label>

      <label>
        Type

        <select id="fty">

          ${
            [
              "RECEIPT",
              "KOT",
              "KITCHEN",
              "BAR",
              "OTHER"
            ]
            .map(
              x => `
                <option
                  ${
                    printer.type === x
                    ? "selected"
                    : ""
                  }
                >
                  ${x}
                </option>
              `
            )
            .join("")
          }

        </select>

      </label>

      <label>
        Connection

        <select id="fco">

          ${
            [
              "USB",
              "NETWORK",
              "BLUETOOTH",
              "WIFI"
            ]
            .map(
              x => `
                <option
                  ${
                    printer.connection === x
                    ? "selected"
                    : ""
                  }
                >
                  ${x}
                </option>
              `
            )
            .join("")
          }

        </select>

      </label>

      <label>
        Host
        <input
          id="fh"
          value="${esc(
            printer.host || ""
          )}"
        >
      </label>

      <label>
        Port
        <input
          id="fpo"
          type="number"
          value="${esc(
            printer.port || ""
          )}"
        >
      </label>

      <label>
        Paper Width

        <select id="fpw">

          <option
            value="58"
            ${
              Number(
                printer.paperWidth
              ) === 58
              ? "selected"
              : ""
            }
          >
            58mm
          </option>

          <option
            value="80"
            ${
              Number(
                printer.paperWidth ||
                80
              ) === 80
              ? "selected"
              : ""
            }
          >
            80mm
          </option>

        </select>

      </label>

      <label>

        <input
          id="fact"
          type="checkbox"
          ${
            printer.active !== false
            ? "checked"
            : ""
          }
        >

        Active

      </label>

    `,
    "printer"
  );

}

/* =========================================================
   SAVE CRUD
========================================================= */

async function saveModal(
  type
){

  const id =
    $("fid").value;

  let url = "";

  let method =
    id
    ? "PATCH"
    : "POST";

  let body = {};

  if(type === "menu"){

    url =
      id
      ? `/api/menu/${id}`
      : "/api/menu";

    body = {

      branchId:
        S.branch.id,

      name:
        $("fn").value.trim(),

      category:
        $("fc").value.trim(),

      price:
        Number(
          $("fp").value
        ),

      taxRate:
        $("ft").value
        ? Number(
            $("ft").value
          )
        : null,

      barcode:
        $("fb").value.trim()
        || null

    };

  }

  if(type === "user"){

    url =
      id
      ? `/api/users/${id}`
      : "/api/users";

    body = {

      name:
        $("fn").value.trim(),

      username:
        $("fu").value.trim(),

      role:
        $("fr").value,

      branchId:
        $("fbranch").value,

      active:
        $("fact").checked

    };

    const password =
      $("fpass").value;

    if(password)
      body.password =
        password;

  }

  if(type === "branch"){

    url =
      id
      ? `/api/branches/${id}`
      : "/api/branches";

    body = {

      name:
        $("fn").value.trim(),

      code:
        $("fc").value.trim(),

      address:
        $("fa").value.trim(),

      phone:
        $("fph").value.trim(),

      gstin:
        $("fg").value.trim(),

      fssai:
        $("ff").value.trim(),

      invoicePrefix:
        $("fi").value.trim(),

      active:
        $("fact").checked

    };

  }

  if(type === "bench"){

    url =
      id
      ? `/api/benches/${id}`
      : "/api/benches";

    body = {

      branchId:
        S.branch.id,

      label:
        $("fl").value.trim(),

      active:
        $("fact").checked

    };

  }

  if(type === "printer"){

    url =
      id
      ? `/api/printers/${id}`
      : "/api/printers";

    body = {

      branchId:
        S.branch.id,

      name:
        $("fn").value.trim(),

      type:
        $("fty").value,

      connection:
        $("fco").value,

      host:
        $("fh").value.trim()
        || null,

      port:
        $("fpo").value
        ? Number(
            $("fpo").value
          )
        : null,

      paperWidth:
        Number(
          $("fpw").value
        ),

      active:
        $("fact").checked

    };

  }

  await api(
    url,
    {
      method,
      body:
        JSON.stringify(body)
    }
  );

  closeModal();

  await loadAll();

  render();

  toast(
    "Saved successfully"
  );

}

/* =========================================================
   BILL ACTIONS
========================================================= */

async function completeBill(
  payment
){

  if(!S.cart.length){

    toast(
      "Add items first",
      "error"
    );

    return;

  }

  const bench =
    $("location").value
    || null;

  const order =
    await api(
      "/api/pos/orders",
      {
        method:"POST",

        body:
          JSON.stringify({

            branchId:
              S.branch.id,

            benchId:
              bench,

            source:
              "POS",

            paymentMethod:
              payment,

            discount:
              0,

            customerName:
              $("customer")
                .value
                .trim()
                || undefined,

            customerPhone:
              $("phone")
                .value
                .trim()
                || undefined,

            lines:
              S.cart.map(
                item => ({
                  menuItemId:
                    item.id,

                  quantity:
                    item.qty
                })
              )

          })
      }
    );

  S.cart = [];

  await Promise.all([
    loadOrders(),
    loadDashboard()
  ]);

  render();

  toast(
    "Bill " +
    (
      order.order?.invoiceNumber
      || ""
    ) +
    " completed"
  );

  if(order.order?.id)
    showOrder(
      order.order.id
    );

}

async function holdBill(){

  if(!S.cart.length){

    toast(
      "Add items first",
      "error"
    );

    return;

  }

  const subtotal =
    cartTotal();

  await api(
    "/api/held-bills",
    {
      method:"POST",

      body:
        JSON.stringify({

          branchId:
            S.branch.id,

          benchId:
            $("location")
              .value
              || null,

          locationType:
            $("location")
              .value
              ? "TABLE"
              : "COUNTER",

          customLocation:
            $("custom")
              .value
              .trim()
              || null,

          customerName:
            $("customer")
              .value
              .trim()
              || null,

          customerPhone:
            $("phone")
              .value
              .trim()
              || null,

          subtotal,

          discount:0,

          tax:0,

          total:subtotal,

          payload:{
            lines:S.cart
          }

        })

    }
  );

  S.cart = [];

  await loadHeld();

  render();

  toast(
    "Bill held"
  );

}

/* =========================================================
   ORDER VIEW
========================================================= */

function showOrder(
  id
){

  const order =
    S.orders.find(
      x => x.id === id
    );

  if(!order)
    return;

  openModal(
    "Bill " +
    (
      order.invoiceNumber ||
      "#" + order.number
    ),

    `

      <div class="receipt">

        <b>
          Sri Ganapathy Andhra's Ruchulu
        </b>

        <small>
          ${new Date(
            order.createdAt
          ).toLocaleString("en-IN")}
        </small>

        ${
          (order.lines || [])
            .map(
              line => `
                <div>

                  <span>
                    ${line.quantity}
                    ×
                    ${esc(
                      line.menuItem?.name ||
                      ""
                    )}
                  </span>

                  <b>
                    ${money(
                      line.lineTotal
                    )}
                  </b>

                </div>
              `
            )
            .join("")
        }

        <hr>

        <div>

          <b>Total</b>

          <b>
            ${money(order.total)}
          </b>

        </div>

        <small>
          Payment:
          ${esc(
            order.paymentMethod ||
            "-"
          )}
        </small>

      </div>

    `,
    "none"
  );

}

/* =========================================================
   SETTINGS SAVE
========================================================= */

async function saveSettings(){

  await api(
    `/api/branches/${S.branch.id}`,
    {
      method:"PATCH",

      body:
        JSON.stringify({

          name:
            $("sn")
              .value
              .trim(),

          code:
            $("sc")
              .value
              .trim(),

          address:
            $("sa")
              .value
              .trim(),

          phone:
            $("sp")
              .value
              .trim(),

          gstin:
            $("sg")
              .value
              .trim(),

          fssai:
            $("sf")
              .value
              .trim(),

          invoicePrefix:
            $("sip")
              .value
              .trim(),

          invoiceTitle:
            $("sit")
              .value
              .trim(),

          taxEnabled:
            $("ste")
              .checked,

          taxRate:
            Number(
              $("str")
                .value || 0
            ),

          receiptPaperWidth:
            Number(
              $("spw")
                .value
            ),

          receiptHeader:
            $("srh")
              .value,

          receiptFooter:
            $("srf")
              .value,

          upiId:
            $("sui")
              .value
              .trim(),

          upiName:
            $("sun")
              .value
              .trim(),

          paymentCashEnabled:
            $("pcash")
              .checked,

          paymentUpiEnabled:
            $("pupi")
              .checked,

          paymentCardEnabled:
            $("pcard")
              .checked

        })

    }
  );

  await loadBranches();

  render();

  toast(
    "Settings saved"
  );

}

/* =========================================================
   RENDER
========================================================= */

function render(){

  const titles = {

    dashboard:[
      "Dashboard",
      "Restaurant overview"
    ],

    billing:[
      "Billing",
      "Fast restaurant billing"
    ],

    sales:[
      "Sales",
      "Previous bills"
    ],

    reports:[
      "Reports",
      "Business reports"
    ],

    kot:[
      "KOT",
      "Kitchen order management"
    ],

    qr:[
      "QR Ordering",
      "Customer ordering"
    ],

    menu:[
      "Menu",
      "Items and prices"
    ],

    tables:[
      "Tables",
      "Locations"
    ],

    staff:[
      "Staff",
      "Users and permissions"
    ],

    branches:[
      "Branches",
      "Outlets"
    ],

    printers:[
      "Printers",
      "Receipt and KOT printers"
    ],

    settings:[
      "Settings",
      "Billing and receipt settings"
    ]

  };

  const t =
    titles[S.view]
    || titles.dashboard;

  setHeader(
    t[0],
    t[1]
  );

  let html;

  switch(
    S.view
  ){

    case "billing":
      html =
        renderBilling();
      break;

    case "sales":
      html =
        renderSales();
      break;

    case "reports":
      html =
        renderReports();
      break;

    case "kot":
      html =
        renderKot();
      break;

    case "qr":
      html =
        renderQr();
      break;

    case "menu":
      html =
        renderMenu();
      break;

    case "tables":
      html =
        renderTables();
      break;

    case "staff":
      html =
        renderStaff();
      break;

    case "branches":
      html =
        renderBranches();
      break;

    case "printers":
      html =
        renderPrinters();
      break;

    case "settings":
      html =
        renderSettings();
      break;

    default:
      html =
        renderDashboard();

  }

  $("content").innerHTML =
    html;

}

/* =========================================================
   EVENTS
========================================================= */

document.addEventListener(
  "click",
  async event => {

    const button =
      event.target.closest(
        "button"
      );

    if(!button)
      return;

    try{

      if(button.dataset.view){

        setView(
          button.dataset.view
        );

        return;

      }

      if(button.dataset.cat){

        S.category =
          button.dataset.cat;

        render();

        return;

      }

      if(button.dataset.add){

        const item =
          S.menu.find(
            x =>
              x.id ===
              button.dataset.add
          );

        addCart(item);

        return;

      }

      if(button.dataset.qty){

        const item =
          S.cart.find(
            x =>
              x.id ===
              button.dataset.id
          );

        if(item){

          item.qty +=
            Number(
              button.dataset.qty
            );

          if(item.qty <= 0){

            S.cart =
              S.cart.filter(
                x =>
                  x.id !==
                  item.id
              );

          }

          render();

        }

        return;

      }

      if(button.dataset.pay){

        await completeBill(
          button.dataset.pay
        );

        return;

      }

      if(
        button.dataset.action ===
        "hold"
      ){

        await holdBill();

        return;

      }

      if(
        button.dataset.action ===
        "clear"
      ){

        S.cart = [];

        render();

        return;

      }

      if(
        button.dataset.action ===
        "refresh"
      ){

        await loadAll();

        render();

        return;

      }

      if(button.dataset.order){

        showOrder(
          button.dataset.order
        );

        return;

      }

      if(button.dataset.status){

        await api(
          `/api/orders/${button.dataset.orderStatus}/status`,
          {
            method:"PATCH",

            body:
              JSON.stringify({
                status:
                  button.dataset.status
              })
          }
        );

        await Promise.all([
          loadOrders(),
          loadDashboard()
        ]);

        render();

        return;

      }

      if(button.dataset.new){

        if(
          button.dataset.new ===
          "menu"
        )
          menuModal();

        if(
          button.dataset.new ===
          "user"
        )
          userModal();

        if(
          button.dataset.new ===
          "branch"
        )
          branchModal();

        if(
          button.dataset.new ===
          "bench"
        )
          benchModal();

        if(
          button.dataset.new ===
          "printer"
        )
          printerModal();

        return;

      }

      if(button.dataset.editMenu){

        menuModal(
          S.menu.find(
            x =>
              x.id ===
              button.dataset.editMenu
          )
        );

        return;

      }

      if(button.dataset.toggleMenu){

        const item =
          S.menu.find(
            x =>
              x.id ===
              button.dataset.toggleMenu
          );

        await api(
          `/api/menu/${item.id}`,
          {
            method:"PATCH",

            body:
              JSON.stringify({
                soldOut:
                  !item.soldOut,
                active:true
              })
          }
        );

        await loadMenu();

        render();

        return;

      }

      if(button.dataset.deleteMenu){

        await api(
          `/api/menu/${button.dataset.deleteMenu}`,
          {
            method:"DELETE"
          }
        );

        await loadMenu();

        render();

        toast(
          "Menu item deleted or archived"
        );

        return;

      }

      if(button.dataset.editUser){

        userModal(
          S.users.find(
            x =>
              x.id ===
              button.dataset.editUser
          )
        );

        return;

      }

      if(button.dataset.disableUser){

        await api(
          `/api/users/${button.dataset.disableUser}`,
          {
            method:"DELETE"
          }
        );

        await loadUsers();

        render();

        toast(
          "Staff disabled"
        );

        return;

      }

      if(button.dataset.editBranch){

        branchModal(
          S.branches.find(
            x =>
              x.id ===
              button.dataset.editBranch
          )
        );

        return;

      }

      if(button.dataset.disableBranch){

        await api(
          `/api/branches/${button.dataset.disableBranch}`,
          {
            method:"DELETE"
          }
        );

        await loadBranches();

        render();

        toast(
          "Branch disabled"
        );

        return;

      }

      if(button.dataset.editBench){

        benchModal(
          S.benches.find(
            x =>
              x.id ===
              button.dataset.editBench
          )
        );

        return;

      }

      if(button.dataset.editPrinter){

        printerModal(
          S.printers.find(
            x =>
              x.id ===
              button.dataset.editPrinter
          )
        );

        return;

      }

      if(button.dataset.disablePrinter){

        await api(
          `/api/printers/${button.dataset.disablePrinter}`,
          {
            method:"DELETE"
          }
        );

        await loadPrinters();

        render();

        toast(
          "Printer disabled"
        );

        return;

      }

      if(button.dataset.openQr){

        window.open(
          "/order/" +
          encodeURIComponent(
            button.dataset.openQr
          ),
          "_blank"
        );

        return;

      }

      if(button.dataset.modalSave){

        await saveModal(
          button.dataset.modalSave
        );

        return;

      }

      if(button.dataset.saveSettings !== undefined){

        await saveSettings();

        return;

      }

      if(button.dataset.close !== undefined){

        closeModal();

        return;

      }

    }catch(error){

      toast(
        error.message ||
        "Operation failed",
        "error"
      );

    }

  }
);

/* =========================================================
   INPUT / CHANGE
========================================================= */

document.addEventListener(
  "input",
  event => {

    if(
      event.target.id ===
      "search"
    ){

      S.search =
        event.target.value;

      render();

    }

  }
);

document.addEventListener(
  "change",
  async event => {

    try{

      if(
        event.target.id ===
        "branchSelect"
      ){

        S.branch =
          S.branches.find(
            x =>
              x.id ===
              event.target.value
          ) ||
          S.branch;

        S.cart = [];

        await loadAll();

        render();

      }

      if(
        event.target.id ===
        "date" ||
        event.target.id ===
        "reportDate"
      ){

        S.date =
          event.target.value;

        await loadDashboard();

        render();

      }

    }catch(error){

      toast(
        error.message,
        "error"
      );

    }

  }
);

/* =========================================================
   LOGIN
========================================================= */

$("loginForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const button =
        $("loginBtn");

      const error =
        $("loginError");

      button.disabled =
        true;

      error.classList.add(
        "hidden"
      );

      try{

        await api(
          "/api/auth/login",
          {
            method:"POST",

            body:
              JSON.stringify({

                username:
                  $("username")
                    .value
                    .trim(),

                password:
                  $("password")
                    .value

              })
          }
        );

        if(
          !(await loadMe())
        ){

          throw new Error(
            "Unable to load account"
          );

        }

        await loadAll();

        $("login")
          .classList.add(
            "hidden"
          );

        $("app")
          .classList.remove(
            "hidden"
          );

        render();

      }catch(error){

        $("loginError")
          .textContent =
          error.message;

        $("loginError")
          .classList.remove(
            "hidden"
          );

      }finally{

        button.disabled =
          false;

      }

    }
  );

/* =========================================================
   GLOBAL
========================================================= */

$("logout")
  .addEventListener(
    "click",
    logout
  );

$("refresh")
  .addEventListener(
    "click",
    async () => {

      await loadAll();

      render();

      toast(
        "Data refreshed"
      );

    }
  );

$("mobile")
  .addEventListener(
    "click",
    () => {

      $("sidebar")
        .classList.toggle(
          "open"
        );

    }
  );

setInterval(
  () => {

    $("clock")
      .textContent =
      new Date()
        .toLocaleString(
          "en-IN",
          {
            dateStyle:"medium",
            timeStyle:"short"
          }
        );

  },
  1000
);

setInterval(
  async () => {

    if(
      S.user &&
      S.branch
    ){

      try{

        await Promise.all([
          loadOrders(),
          loadDashboard()
        ]);

        if(
          S.view === "dashboard" ||
          S.view === "kot"
        ){

          render();

        }

      }catch{}

    }

  },
  5000
);

$("modal")
  .addEventListener(
    "click",
    event => {

      if(
        event.target.classList.contains(
          "backdrop"
        )
      ){

        closeModal();

      }

    }
  );

/* =========================================================
   BOOT
========================================================= */

(async () => {

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        900
      )
  );

  $("splash")
    .classList.add(
      "hidden"
    );

  if(
    await loadMe()
  ){

    try{

      await loadAll();

      $("app")
        .classList.remove(
          "hidden"
        );

      render();

    }catch(error){

      $("login")
        .classList.remove(
          "hidden"
        );

      toast(
        error.message,
        "error"
      );

    }

  }else{

    $("login")
      .classList.remove(
        "hidden"
      );

  }

})();

})();


/* ============================================================
   SGAR PRODUCTION SESSION RESTORE
   ------------------------------------------------------------
   Login remains active across:
   - page refresh
   - route navigation
   - browser restart while session cookie is valid

   Password/token is NEVER stored in localStorage.
   Authentication remains server-side through HttpOnly cookie.
   ============================================================ */

const SGAR_PRODUCTION_SESSION_RESTORE_V1 = true;

(function restoreSriGanapathySession() {

    const RESTORE_KEY = "sgar_session_restore_attempt";

    async function getCurrentSession() {
        try {

            const response = await fetch("/api/me", {
                method: "GET",
                credentials: "include",
                cache: "no-store",
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            if (!data || !data.ok || !data.user) {
                return null;
            }

            return data.user;

        } catch (error) {

            console.warn(
                "SGAR session restore check failed:",
                error
            );

            return null;
        }
    }

    async function restore() {

        const user = await getCurrentSession();

        if (!user) {

            try {
                sessionStorage.removeItem(RESTORE_KEY);
            } catch (_) {}

            return;
        }

        /*
         * Expose the authenticated user so the existing POS app
         * can reuse the server-confirmed session without storing
         * credentials in browser storage.
         */

        window.__SGAR_AUTH_USER__ = user;

        window.dispatchEvent(
            new CustomEvent(
                "sgar:session-restored",
                {
                    detail: user
                }
            )
        );

        /*
         * If the existing application exposes one of these common
         * session initialization functions, use it.
         */
        try {

            if (
                typeof window.loadCurrentUser === "function"
            ) {
                await window.loadCurrentUser(user);
            }

            if (
                typeof window.restoreSession === "function"
            ) {
                await window.restoreSession(user);
            }

            if (
                typeof window.restoreAuthSession === "function"
            ) {
                await window.restoreAuthSession(user);
            }

        } catch (error) {

            console.warn(
                "Existing application session restore hook failed:",
                error
            );
        }

        /*
         * Notify again after the DOM has settled.
         * This helps applications that create the main shell
         * asynchronously after startup.
         */

        setTimeout(function () {

            window.dispatchEvent(
                new CustomEvent(
                    "sgar:session-ready",
                    {
                        detail: user
                    }
                )
            );

        }, 50);
    }

    /*
     * Run immediately.
     */
    restore();

    /*
     * Run once again after DOMContentLoaded.
     */
    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            function () {
                restore();
            },
            {
                once: true
            }
        );

    }

    /*
     * Run after the application has had time to initialize.
     */
    setTimeout(
        restore,
        300
    );

})();


/* =================================================================
   SGAR_MAJOR_SESSION_RESTORE_V2

   Production authentication rules:

   - Browser NEVER stores password.
   - Browser NEVER stores JWT/session secret.
   - Authentication uses HttpOnly cookie.
   - Page refresh calls /api/me.
   - Valid session is restored.
   - Manual logout is the only normal logout action.
   ================================================================= */

(function SGAR_MAJOR_SESSION_RESTORE_V2() {

    const state = {
        checking: true,
        authenticated: false,
        user: null
    };

    window.__SGAR_AUTH_STATE__ = state;

    function markReady() {

        document.documentElement.classList.remove(
            "sgar-auth-checking"
        );

        document.documentElement.classList.add(
            "sgar-auth-ready"
        );

        const loading = document.getElementById(
            "sgar-auth-loading"
        );

        if (loading) {
            loading.remove();
        }
    }

    function createLoadingScreen() {

        if (document.getElementById("sgar-auth-loading")) {
            return;
        }

        const loading = document.createElement("div");

        loading.id = "sgar-auth-loading";

        loading.innerHTML = `
            <div class="sgar-auth-loading-inner">
                <img
                    src="/brand/logo-primary.jpg"
                    alt="Sri Ganapathy Andhra's Ruchulu"
                >
                <div class="sgar-auth-loading-title">
                    Sri Ganapathy Andhra's Ruchulu
                </div>
                <div class="sgar-auth-loading-bar"></div>
            </div>
        `;

        document.body.appendChild(loading);
    }

    async function checkServerSession() {

        try {

            const response = await fetch(
                "/api/me",
                {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store",
                    headers: {
                        "Accept": "application/json"
                    }
                }
            );

            if (!response.ok) {

                state.checking = false;
                state.authenticated = false;
                state.user = null;

                window.__SGAR_AUTH_USER__ = null;

                window.dispatchEvent(
                    new CustomEvent(
                        "sgar:auth-unauthenticated"
                    )
                );

                markReady();

                return null;
            }

            const data = await response.json();

            if (
                !data ||
                data.ok !== true ||
                !data.user
            ) {

                state.checking = false;
                state.authenticated = false;
                state.user = null;

                window.__SGAR_AUTH_USER__ = null;

                window.dispatchEvent(
                    new CustomEvent(
                        "sgar:auth-unauthenticated"
                    )
                );

                markReady();

                return null;
            }

            state.checking = false;
            state.authenticated = true;
            state.user = data.user;

            window.__SGAR_AUTH_USER__ = data.user;

            window.dispatchEvent(
                new CustomEvent(
                    "sgar:auth-restored",
                    {
                        detail: data.user
                    }
                )
            );

            /*
             * Give existing POS code a chance to consume the
             * server-confirmed session.
             */

            try {

                if (
                    typeof window.loadCurrentUser ===
                    "function"
                ) {
                    await window.loadCurrentUser(
                        data.user
                    );
                }

            } catch (error) {

                console.warn(
                    "loadCurrentUser restore failed:",
                    error
                );
            }

            try {

                if (
                    typeof window.restoreSession ===
                    "function"
                ) {
                    await window.restoreSession(
                        data.user
                    );
                }

            } catch (error) {

                console.warn(
                    "restoreSession failed:",
                    error
                );
            }

            try {

                if (
                    typeof window.restoreAuthSession ===
                    "function"
                ) {
                    await window.restoreAuthSession(
                        data.user
                    );
                }

            } catch (error) {

                console.warn(
                    "restoreAuthSession failed:",
                    error
                );
            }

            window.dispatchEvent(
                new CustomEvent(
                    "sgar:session-ready",
                    {
                        detail: data.user
                    }
                )
            );

            markReady();

            return data.user;

        } catch (error) {

            console.error(
                "SGAR authentication check failed:",
                error
            );

            state.checking = false;
            state.authenticated = false;
            state.user = null;

            window.__SGAR_AUTH_USER__ = null;

            window.dispatchEvent(
                new CustomEvent(
                    "sgar:auth-check-failed",
                    {
                        detail: error
                    }
                )
            );

            markReady();

            return null;
        }
    }

    /*
     * Start as early as possible.
     */

    if (
        document.readyState === "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            function () {

                createLoadingScreen();

                checkServerSession();

            },
            {
                once: true
            }
        );

    } else {

        createLoadingScreen();

        checkServerSession();
    }

    /*
     * Expose an explicit function for the application.
     */

    window.restoreSriGanapathySession =
        checkServerSession;

})();


/* =================================================================
   SGAR_FETCH_CREDENTIALS_V2

   Same-origin API requests always include the session cookie.
   ================================================================= */

(function SGAR_FETCH_CREDENTIALS_V2() {

    const originalFetch = window.fetch.bind(window);

    window.fetch = function(
        input,
        init
    ) {

        const requestInit =
            init
                ? Object.assign({}, init)
                : {};

        let url = "";

        try {

            if (
                typeof input === "string"
            ) {
                url = input;
            }
            else if (
                input &&
                input.url
            ) {
                url = input.url;
            }

        } catch (_) {}

        if (
            url.startsWith("/api/")
        ) {

            if (
                requestInit.credentials ===
                undefined
            ) {
                requestInit.credentials =
                    "include";
            }

            if (
                requestInit.cache ===
                undefined
            ) {
                requestInit.cache =
                    "no-store";
            }
        }

        return originalFetch(
            input,
            requestInit
        );
    };

})();
