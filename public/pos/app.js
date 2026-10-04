
function escapeHtml(value){

    return String(value ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");

}
(() => {
  "use strict";

  const state = {
    user: null,
    branch: null,
    menu: [],
    categories: [],
    activeCategory: "ALL",
    cart: new Map(),
    heldBills: [],
    benches: [],
    lastOrder: null,
    refreshTimer: null
  };

  const $ = (id) =>
    document.getElementById(id);

  const money = (value) =>
    `₹${Number(value || 0).toFixed(2)}`;

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  async function api(
    url,
    options = {}
  ) {
    const response =
      await fetch(url, {
        credentials: "include",
        headers: {
          "Content-Type":
            "application/json",
          ...(options.headers || {})
        },
        ...options
      });

    let data = null;

    try {
      data =
        await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const error =
        new Error(
          data?.error ||
          `Request failed (${response.status})`
        );

      error.status =
        response.status;

      throw error;
    }

    return data;
  }

  function showToast(
    message
  ) {
    const toast =
      $("toast");

    toast.textContent =
      message;

    toast.classList.remove(
      "hidden"
    );

    clearTimeout(
      showToast.timer
    );

    showToast.timer =
      setTimeout(() => {
        toast.classList.add(
          "hidden"
        );
      }, 2600);
  }

  function openModal(id) {
    $(id).classList.remove(
      "hidden"
    );
  }

  function closeModal(id) {
    $(id).classList.add(
      "hidden"
    );
  }

  function initials(name) {
    return String(name || "M")
      .trim()
      .split(/\s+/)
      .map(x => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function setLoginError(
    message
  ) {
    const el =
      $("loginError");

    if (!message) {
      el.classList.add(
        "hidden"
      );
      el.textContent = "";
      return;
    }

    el.textContent =
      message;

    el.classList.remove(
      "hidden"
    );
  }

  async function getMe() {
    try {
      const data =
        await api(
          "/api/me"
        );

      state.user =
        data.user;

      return true;
    } catch {
      state.user = null;
      return false;
    }
  }

  async function login(
    username,
    password
  ) {

    const button =
      $("loginButton");

    button.disabled = true;
    button.textContent =
      "Signing in...";

    setLoginError("");

    try {

      const data =
        await api(
          "/api/auth/login",
          {
            method: "POST",
            body:
              JSON.stringify({
                username,
                password
              })
          }
        );

      state.user =
        data.user;

      await startApplication();

    } catch (error) {

      setLoginError(
        error.message ||
        "Login failed"
      );

      $("password")
        .focus();

    } finally {

      button.disabled = false;
      button.textContent =
        "Login";
    }
  }

  async function logout() {

    try {
      await api(
        "/api/auth/logout",
        {
          method: "POST",
          body: "{}"
        }
      );
    } catch {}

    state.user = null;
    state.cart.clear();

    if (
      state.refreshTimer
    ) {
      clearInterval(
        state.refreshTimer
      );
    }

    location.reload();
  }

  async function loadBranch() {

    const data =
      await api(
        "/api/branches"
      );

    if (
      !Array.isArray(data) ||
      !data.length
    ) {
      throw new Error(
        "No active branch is assigned to this account"
      );
    }

    if (
      state.user.role ===
      "SUPER_ADMIN"
    ) {
      state.branch =
        data[0];
    } else {
      state.branch =
        data.find(
          branch =>
            branch.id ===
            state.user.branchId
        ) || data[0];
    }

    $("branchName")
      .textContent =
      state.branch.name;
  }

  async function loadMenu() {

    const data =
      await api(
        `/api/menu?branchId=${encodeURIComponent(state.branch.id)}`
      );

    state.menu =
      Array.isArray(data)
        ? data
        : [];

    state.categories = [
      "ALL",
      ...new Set(
        state.menu
          .map(item =>
            item.category
          )
          .filter(Boolean)
      )
    ];

    renderCategories();
    renderMenu();

    $("menuMeta")
      .textContent =
      `${state.menu.length} items`;
  }

  async function loadBenches() {

    try {
      const data =
        await api(
          `/api/benches?branchId=${encodeURIComponent(state.branch.id)}`
        );

      state.benches =
        Array.isArray(data)
          ? data
          : [];

      populateBenchOptions();

    } catch {
      state.benches = [];
    }
  }

  function populateBenchOptions() {

    const select =
      $("locationSelect");

    const custom =
      [...select.options]
        .find(
          option =>
            option.value ===
            "CUSTOM"
        );

    [
      ...select.options
    ]
      .filter(
        option =>
          option.value.startsWith(
            "BENCH_"
          )
      )
      .forEach(
        option =>
          option.remove()
      );

    const options =
      state.benches
        .slice()
        .sort(
          (a, b) =>
            a.label.localeCompare(
              b.label,
              undefined,
              {
                numeric: true
              }
            )
        );

    options.forEach(
      bench => {

        const option =
          document.createElement(
            "option"
          );

        option.value =
          `BENCH_ID:${bench.id}`;

        option.textContent =
          bench.label;

        select.insertBefore(
          option,
          custom
        );
      }
    );
  }

  function renderCategories() {

    const container =
      $("categories");

    container.innerHTML =
      state.categories
        .map(category => `
          <button
            type="button"
            class="category-button ${
              category ===
              state.activeCategory
                ? "active"
                : ""
            }"
            data-category="${escapeHtml(category)}"
          >
            ${
              category === "ALL"
                ? "All"
                : escapeHtml(category)
            }
          </button>
        `)
        .join("");

    container
      .querySelectorAll(
        "[data-category]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              state.activeCategory =
                button.dataset.category;

              renderCategories();
              renderMenu();
            }
          );
        }
      );
  }

  function renderMenu() {

    const query =
      $("menuSearch")
        .value
        .trim()
        .toLowerCase();

    const items =
      state.menu.filter(
        item => {

          const categoryMatch =
            state.activeCategory ===
              "ALL" ||
            item.category ===
              state.activeCategory;

          const text =
            `${item.name} ${item.category} ${item.barcode || ""}`
              .toLowerCase();

          return (
            categoryMatch &&
            (!query ||
              text.includes(query))
          );
        }
      );

    const container =
      $("menuGrid");

    if (!items.length) {
      container.innerHTML = `
        <div
          style="
            grid-column:1/-1;
            padding:50px 20px;
            text-align:center;
            color:#777;
          "
        >
          No items found
        </div>
      `;

      return;
    }

    container.innerHTML =
      items.map(
        item => {

          const image =
            item.imageUrl ||
            "/brand/logo-primary.jpg";

          return `
            <button
              type="button"
              class="menu-card ${
                item.soldOut
                  ? "sold-out"
                  : ""
              }"
              data-menu-id="${item.id}"
              ${
                item.soldOut
                  ? "disabled"
                  : ""
              }
            >

              ${
                item.soldOut
                  ? `<span class="sold-label">SOLD OUT</span>`
                  : ""
              }

              <img
                class="menu-image"
                src="${escapeHtml(image)}"
                alt=""
                loading="lazy"
                onerror="this.src='/brand/logo-primary.jpg'"
              >

              <span class="menu-info">

                <span class="menu-name">
                  ${escapeHtml(item.name)}
                </span>

                <span class="menu-category">
                  ${escapeHtml(item.category)}
                </span>

                <span class="menu-price">
                  ${money(item.price)}
                </span>

              </span>

            </button>
          `;
        }
      )
      .join("");

    container
      .querySelectorAll(
        "[data-menu-id]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              const id =
                button.dataset.menuId;

              addToCart(id);
            }
          );
        }
      );
  }

  function addToCart(
    menuItemId
  ) {

    const item =
      state.menu.find(
        x =>
          x.id ===
          menuItemId
      );

    if (!item) return;

    if (item.soldOut) {
      showToast(
        `${item.name} is sold out`
      );
      return;
    }

    const existing =
      state.cart.get(
        menuItemId
      );

    if (existing) {
      existing.quantity += 1;
    } else {
      state.cart.set(
        menuItemId,
        {
          menuItemId,
          quantity: 1
        }
      );
    }

    renderBill();
  }

  function changeQuantity(
    id,
    delta
  ) {

    const line =
      state.cart.get(id);

    if (!line) return;

    line.quantity +=
      delta;

    if (
      line.quantity <= 0
    ) {
      state.cart.delete(id);
    }

    renderBill();
  }

  function calculateTotals() {

    let subtotal = 0;

    for (
      const line of
      state.cart.values()
    ) {

      const item =
        state.menu.find(
          x =>
            x.id ===
            line.menuItemId
        );

      if (!item) continue;

      subtotal +=
        Number(item.price) *
        line.quantity;
    }

    subtotal =
      Math.round(
        subtotal * 100
      ) / 100;

    const discount =
      Math.min(
        Math.max(
          Number(
            $("discount").value ||
            0
          ),
          0
        ),
        subtotal
      );

    const taxable =
      subtotal - discount;

    const tax =
      state.branch?.taxEnabled
        ? Math.round(
            taxable *
            (Number(
              state.branch.taxRate ||
              0
            ) / 100) *
            100
          ) / 100
        : 0;

    const total =
      Math.round(
        (taxable + tax) *
        100
      ) / 100;

    return {
      subtotal,
      discount,
      tax,
      total
    };
  }

  function renderBill() {

    const container =
      $("billLines");

    if (
      state.cart.size === 0
    ) {

      container.innerHTML = `
        <div class="empty-bill">
          <div class="empty-icon">+</div>
          <strong>
            Add items to start billing
          </strong>
          <span>
            Select any item from the menu
          </span>
        </div>
      `;

    } else {

      container.innerHTML =
        [...state.cart.values()]
          .map(line => {

            const item =
              state.menu.find(
                x =>
                  x.id ===
                  line.menuItemId
              );

            if (!item) {
              return "";
            }

            const lineTotal =
              Number(item.price) *
              line.quantity;

            return `
              <div class="bill-line">

                <div>
                  <div class="bill-line-name">
                    ${escapeHtml(item.name)}
                  </div>

                  <div class="bill-line-price">
                    ${money(item.price)} each
                  </div>

                  <div class="qty-control">

                    <button
                      type="button"
                      data-minus="${item.id}"
                    >
                      −
                    </button>

                    <span>
                      ${line.quantity}
                    </span>

                    <button
                      type="button"
                      data-plus="${item.id}"
                    >
                      +
                    </button>

                  </div>
                </div>

                <div class="bill-line-right">

                  <div class="bill-line-total">
                    ${money(lineTotal)}
                  </div>

                </div>

              </div>
            `;
          })
          .join("");

      container
        .querySelectorAll(
          "[data-minus]"
        )
        .forEach(
          button => {

            button.addEventListener(
              "click",
              () =>
                changeQuantity(
                  button.dataset.minus,
                  -1
                )
            );
          }
        );

      container
        .querySelectorAll(
          "[data-plus]"
        )
        .forEach(
          button => {

            button.addEventListener(
              "click",
              () =>
                changeQuantity(
                  button.dataset.plus,
                  1
                )
            );
          }
        );
    }

    const totals =
      calculateTotals();

    $("subtotal")
      .textContent =
      money(totals.subtotal);

    $("tax")
      .textContent =
      money(totals.tax);

    $("total")
      .textContent =
      money(totals.total);
  }

  function getLocation() {

    const value =
      $("locationSelect")
        .value;

    if (
      value === "COUNTER"
    ) {
      return {
        benchId: null,
        locationType:
          "COUNTER",
        customLocation:
          null
      };
    }

    if (
      value === "CUSTOM"
    ) {
      const custom =
        $("customLocation")
          .value
          .trim();

      return {
        benchId: null,
        locationType:
          "CUSTOM",
        customLocation:
          custom || null
      };
    }

    if (
      value.startsWith(
        "BENCH_ID:"
      )
    ) {
      return {
        benchId:
          value.substring(
            "BENCH_ID:".length
          ),
        locationType:
          "BENCH",
        customLocation:
          null
      };
    }

    return {
      benchId: null,
      locationType:
        "COUNTER",
      customLocation:
        null
    };
  }

  function cartLines() {

    return [
      ...state.cart.values()
    ].map(line => ({
      menuItemId:
        line.menuItemId,
      quantity:
        line.quantity
    }));
  }

  async function completeBill() {

    if (
      state.cart.size === 0
    ) {
      showToast(
        "Add at least one item"
      );
      return;
    }

    const button =
      $("completeButton");

    button.disabled = true;
    button.textContent =
      "Saving...";

    try {

      const location =
        getLocation();

      const totals =
        calculateTotals();

      const paymentMethod =
        await choosePaymentMethod();

      if (!paymentMethod) {
        return;
      }

      const clientRequestId =
        cryptoRandom();

      const data =
        await api(
          "/api/pos/orders",
          {
            method: "POST",
            body:
              JSON.stringify({
                branchId:
                  state.branch.id,

                benchId:
                  location.benchId,

                customerName:
                  $("customerName")
                    .value
                    .trim() ||
                  undefined,

                customerPhone:
                  $("customerPhone")
                    .value
                    .trim() ||
                  undefined,

                notes:
                  location.customLocation
                    ? `Location: ${location.customLocation}`
                    : undefined,

                paymentMethod,

                discount:
                  totals.discount,

                clientRequestId,

                lines:
                  cartLines()
              })
          }
        );

      state.lastOrder =
        data.order;

      showReceipt(
        data.order
      );

      state.cart.clear();

      $("customerName")
        .value = "";

      $("customerPhone")
        .value = "";

      $("discount")
        .value = "0";

      $("locationSelect")
        .value = "COUNTER";

      $("customLocation")
        .value = "";

      $("customLocation")
        .classList.add(
          "hidden"
        );

      renderBill();

    } catch (error) {

      showToast(
        error.message ||
        "Unable to complete bill"
      );

    } finally {

      button.disabled = false;
      button.textContent =
        "Complete Bill";
    }
  }

  function cryptoRandom() {

    if (
      window.crypto &&
      window.crypto.randomUUID
    ) {
      return window.crypto.randomUUID();
    }

    return (
      Date.now().toString(36) +
      Math.random()
        .toString(36)
        .slice(2)
    );
  }

  async function choosePaymentMethod() {

    const options = [];

    if (
      state.branch.paymentCashEnabled !==
      false
    ) {
      options.push(
        "CASH"
      );
    }

    if (
      state.branch.paymentUpiEnabled !==
      false
    ) {
      options.push(
        "UPI"
      );
    }

    if (
      state.branch.paymentCardEnabled !==
      false
    ) {
      options.push(
        "CARD"
      );
    }

    if (!options.length) {
      return "CASH";
    }

    const answer =
      window.prompt(
        `Payment method:\n\n${options.join("\n")}\n\nEnter one:`
      );

    if (!answer) {
      return null;
    }

    const normalized =
      answer
        .trim()
        .toUpperCase();

    if (
      !options.includes(
        normalized
      )
    ) {
      showToast(
        "Invalid payment method"
      );

      return null;
    }

    return normalized;
  }

  async function holdBill() {

    if (
      state.cart.size === 0
    ) {
      showToast(
        "Add items before holding"
      );
      return;
    }

    try {

      const location =
        getLocation();

      const totals =
        calculateTotals();

      await api(
        "/api/held-bills",
        {
          method: "POST",
          body:
            JSON.stringify({
              branchId:
                state.branch.id,

              benchId:
                location.benchId,

              customerName:
                $("customerName")
                  .value
                  .trim() ||
                undefined,

              customerPhone:
                $("customerPhone")
                  .value
                  .trim() ||
                undefined,

              subtotal:
                totals.subtotal,

              discount:
                totals.discount,

              tax:
                totals.tax,

              total:
                totals.total,

              locationType:
                location.locationType,

              customLocation:
                location.customLocation,

              payload: {
                lines:
                  cartLines()
              }
            })
        }
      );

      state.cart.clear();

      $("customerName")
        .value = "";

      $("customerPhone")
        .value = "";

      $("discount")
        .value = "0";

      renderBill();

      await loadHeldBills();

      showToast(
        "Bill held"
      );

    } catch (error) {

      showToast(
        error.message ||
        "Unable to hold bill"
      );
    }
  }

  async function loadHeldBills() {

    try {

      const data =
        await api(
          `/api/held-bills?branchId=${encodeURIComponent(state.branch.id)}`
        );

      state.heldBills =
        Array.isArray(data)
          ? data
          : [];

      $("heldCount")
        .textContent =
        state.heldBills.length;

    } catch {
      state.heldBills = [];
    }
  }

  function renderHeldBills() {

    const container =
      $("heldList");

    if (
      !state.heldBills.length
    ) {
      container.innerHTML = `
        <div class="empty-bill">
          No held bills
        </div>
      `;

      return;
    }

    container.innerHTML =
      state.heldBills
        .map(
          held => `
            <div class="held-item">

              <div>
                <strong>
                  ${
                    escapeHtml(
                      held.customerName ||
                      "Walk-in customer"
                    )
                  }
                </strong>

                <br>

                <small>
                  ${
                    escapeHtml(
                      held.bench?.label ||
                      held.payload?.locationType ||
                      "Counter"
                    )
                  }
                </small>

                <br>

                <small>
                  ${new Date(
                    held.updatedAt
                  ).toLocaleString("en-IN")}
                </small>
              </div>

              <div
                style="text-align:right"
              >
                <strong>
                  ${money(held.total)}
                </strong>

                <div class="held-actions">

                  <button
                    class="secondary-button"
                    data-resume="${held.id}"
                  >
                    Resume
                  </button>

                  <button
                    class="danger-button"
                    data-delete-held="${held.id}"
                  >
                    Delete
                  </button>

                </div>
              </div>

            </div>
          `
        )
        .join("");

    container
      .querySelectorAll(
        "[data-delete-held]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            async () => {

              try {

                await api(
                  `/api/held-bills/${button.dataset.deleteHeld}`,
                  {
                    method:
                      "DELETE",
                    body: "{}"
                  }
                );

                await loadHeldBills();
                renderHeldBills();

                showToast(
                  "Held bill deleted"
                );

              } catch (error) {

                showToast(
                  error.message
                );
              }
            }
          );
        }
      );

    container
      .querySelectorAll(
        "[data-resume]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              const held =
                state.heldBills.find(
                  item =>
                    item.id ===
                    button.dataset.resume
                );

              if (!held) {
                return;
              }

              state.cart.clear();

              for (
                const line of
                held.payload?.lines ||
                []
              ) {

                const item =
                  state.menu.find(
                    x =>
                      x.id ===
                      line.menuItemId
                  );

                if (
                  item &&
                  !item.soldOut
                ) {
                  state.cart.set(
                    item.id,
                    {
                      menuItemId:
                        item.id,
                      quantity:
                        Number(
                          line.quantity
                        )
                    }
                  );
                }
              }

              $("customerName")
                .value =
                held.customerName ||
                "";

              $("customerPhone")
                .value =
                held.customerPhone ||
                "";

              $("discount")
                .value =
                held.discount ||
                0;

              closeModal(
                "heldModal"
              );

              renderBill();

              showToast(
                "Bill resumed"
              );
            }
          );
        }
      );
  }

  async function showHeldBills() {

    await loadHeldBills();
    renderHeldBills();
    openModal(
      "heldModal"
    );
  }

  function showReceipt(
    order
  ) {

    $("receiptSummary")
      .innerHTML = `
        <div class="receipt-summary-row">
          <span>Bill</span>
          <strong>
            ${escapeHtml(
              order.invoiceNumber ||
              String(order.number)
            )}
          </strong>
        </div>

        <div class="receipt-summary-row">
          <span>Items</span>
          <strong>
            ${order.lines?.reduce(
              (sum, line) =>
                sum + line.quantity,
              0
            ) || 0}
          </strong>
        </div>

        <div class="receipt-summary-row">
          <span>Payment</span>
          <strong>
            ${escapeHtml(
              order.paymentMethod ||
              "-"
            )}
          </strong>
        </div>

        <div class="receipt-summary-total">
          <span>Total</span>
          <strong>
            ${money(order.total)}
          </strong>
        </div>
      `;

    $("openReceiptButton")
      .onclick = () => {

        window.open(
          `/api/orders/${encodeURIComponent(order.id)}/pdf`,
          "_blank",
          "noopener"
        );
      };

    openModal(
      "receiptModal"
    );
  }

  async function loadSales() {

    const date =
      $("salesDate")
        .value;

    if (!date) {
      return;
    }

    const result =
      $("salesResult");

    result.innerHTML =
      "Loading...";

    try {

      const data =
        await api(
          `/api/reports/daily-sales?branchId=${encodeURIComponent(state.branch.id)}&date=${encodeURIComponent(date)}`
        );

      result.innerHTML = `
        <div class="sales-main">
          ${money(data.totalSales)}
        </div>

        <div class="muted">
          ${escapeHtml(data.date)}
        </div>

        <div class="sales-grid">

          <div class="sales-box">
            <span>Orders</span>
            <strong>
              ${data.orders}
            </strong>
          </div>

          <div class="sales-box">
            <span>Cash</span>
            <strong>
              ${money(data.cash)}
            </strong>
          </div>

          <div class="sales-box">
            <span>UPI</span>
            <strong>
              ${money(data.upi)}
            </strong>
          </div>

          <div class="sales-box">
            <span>Card</span>
            <strong>
              ${money(data.card)}
            </strong>
          </div>

          <div class="sales-box">
            <span>QR Orders</span>
            <strong>
              ${data.qrOrders}
            </strong>
          </div>

          <div class="sales-box">
            <span>Pending</span>
            <strong>
              ${data.pending}
            </strong>
          </div>

        </div>

        <div
          style="
            border-top:1px solid #eee;
            padding-top:15px;
          "
        >
          <strong>
            Items sold
          </strong>

          ${
            data.items.length
              ? `
                <div
                  style="
                    margin-top:10px;
                    display:grid;
                    gap:7px;
                  "
                >
                  ${data.items
                    .map(
                      item => `
                        <div
                          style="
                            display:flex;
                            justify-content:space-between;
                            border-bottom:1px solid #f0f0f0;
                            padding:7px 0;
                          "
                        >
                          <span>
                            ${escapeHtml(item.name)}
                          </span>

                          <strong>
                            ${item.quantity}
                          </strong>
                        </div>
                      `
                    )
                    .join("")}
                </div>
              `
              : `
                <div
                  class="muted"
                  style="margin-top:10px"
                >
                  No items
                </div>
              `
          }
        </div>
      `;

    } catch (error) {

      result.innerHTML = `
        <div class="form-error">
          ${escapeHtml(
            error.message
          )}
        </div>
      `;
    }
  }

  async function startApplication() {

    $("loginScreen")
      .classList.add(
        "hidden"
      );

    $("posScreen")
      .classList.remove(
        "hidden"
      );

    $("profileInitial")
      .textContent =
      initials(
        state.user.name
      );

    $("profileAvatar")
      .textContent =
      initials(
        state.user.name
      );

    $("profileName")
      .textContent =
      state.user.name;

    $("profileUsername")
      .textContent =
      `@${state.user.username}`;

    $("profileRole")
      .textContent =
      state.user.role;

    await loadBranch();
    await loadMenu();
    await loadBenches();
    await loadHeldBills();

    renderBill();

    /*
     * Netlify-safe branch-scoped refresh.
     * Never asks for another branch.
     */
    state.refreshTimer =
      setInterval(
        async () => {

          try {
            await loadMenu();
          } catch {}

          try {
            await loadHeldBills();
          } catch {}

        },
        5000
      );
  }

  function bindEvents() {

    $("loginForm")
      .addEventListener(
        "submit",
        async event => {

          event.preventDefault();

          await login(
            $("username")
              .value
              .trim(),
            $("password")
              .value
          );
        }
      );

    $("togglePassword")
      .addEventListener(
        "click",
        () => {

          const input =
            $("password");

          const visible =
            input.type ===
            "text";

          input.type =
            visible
              ? "password"
              : "text";

          $("togglePassword")
            .textContent =
            visible
              ? "Show"
              : "Hide";
        }
      );

    $("menuSearch")
      .addEventListener(
        "input",
        renderMenu
      );

    $("discount")
      .addEventListener(
        "input",
        renderBill
      );

    $("locationSelect")
      .addEventListener(
        "change",
        () => {

          const custom =
            $("customLocation");

          if (
            $("locationSelect")
              .value ===
            "CUSTOM"
          ) {
            custom.classList.remove(
              "hidden"
            );
          } else {
            custom.classList.add(
              "hidden"
            );
          }
        }
      );

    $("completeButton")
      .addEventListener(
        "click",
        completeBill
      );

    $("holdButton")
      .addEventListener(
        "click",
        holdBill
      );

    $("clearBillButton")
      .addEventListener(
        "click",
        () => {

          if (
            state.cart.size === 0
          ) {
            return;
          }

          if (
            !window.confirm(
              "Clear current bill?"
            )
          ) {
            return;
          }

          state.cart.clear();

          $("customerName")
            .value = "";

          $("customerPhone")
            .value = "";

          $("discount")
            .value = "0";

          renderBill();
        }
      );

    $("heldBillsButton")
      .addEventListener(
        "click",
        showHeldBills
      );

    $("salesButton")
      .addEventListener(
        "click",
        () => {

          const today =
            new Date();

          $("salesDate")
            .value =
            today
              .toISOString()
              .slice(0, 10);

          openModal(
            "salesModal"
          );

          loadSales();
        }
      );

    $("loadSalesButton")
      .addEventListener(
        "click",
        loadSales
      );

    $("profileButton")
      .addEventListener(
        "click",
        () =>
          openModal(
            "profileModal"
          )
      );

    $("changePasswordButton")
      .addEventListener(
        "click",
        () => {

          closeModal(
            "profileModal"
          );

          openModal(
            "passwordModal"
          );
        }
      );

    $("logoutButton")
      .addEventListener(
        "click",
        logout
      );

    $("passwordForm")
      .addEventListener(
        "submit",
        async event => {

          event.preventDefault();

          const error =
            $("passwordError");

          error.classList.add(
            "hidden"
          );

          try {

            await api(
              "/api/me/password",
              {
                method: "POST",
                body:
                  JSON.stringify({
                    currentPassword:
                      $("currentPassword")
                        .value,

                    newPassword:
                      $("newPassword")
                        .value
                  })
              }
            );

            showToast(
              "Password changed"
            );

            setTimeout(
              logout,
              900
            );

          } catch (err) {

            error.textContent =
              err.message;

            error.classList.remove(
              "hidden"
            );
          }
        }
      );

    $("newBillButton")
      .addEventListener(
        "click",
        () =>
          closeModal(
            "receiptModal"
          )
      );

    document
      .querySelectorAll(
        "[data-close]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () =>
              closeModal(
                button.dataset.close
              )
          );
        }
      );

    document
      .querySelectorAll(
        ".modal"
      )
      .forEach(
        modal => {

          modal.addEventListener(
            "click",
            event => {

              if (
                event.target ===
                modal
              ) {
                modal.classList.add(
                  "hidden"
                );
              }
            }
          );
        }
      );
  }

  async function boot() {

    bindEvents();

    setTimeout(
      async () => {

        $("splash")
          .classList.add(
            "hidden"
          );

        const authenticated =
          await getMe();

        if (authenticated) {

          try {
            await startApplication();
          } catch (error) {

            setLoginError(
              error.message
            );

            $("loginScreen")
              .classList.remove(
                "hidden"
              );
          }

        } else {

          $("loginScreen")
            .classList.remove(
              "hidden"
            );

          $("username")
            .focus();
        }

      },
      650
    );
  }

  boot();

})();
