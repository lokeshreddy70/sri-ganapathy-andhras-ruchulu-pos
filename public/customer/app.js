(() => {
  "use strict";

  const root =
    document.getElementById("app");

  const state = {
    token: "",
    branch: null,
    bench: null,
    menu: [],
    category: "ALL",
    cart: new Map(),
    order: null,
    submitting: false,
    loading: true,
    statusTimer: null
  };

  /* ==========================================================
     HELPERS
     ========================================================== */

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(value) {
    return `₹${Number(value || 0).toFixed(2)}`;
  }

  function tokenFromUrl() {

    const path =
      window.location.pathname;

    const match =
      path.match(
        /^\/order\/([^/]+)\/?$/
      );

    if (match) {
      return decodeURIComponent(
        match[1]
      );
    }

    const params =
      new URLSearchParams(
        window.location.search
      );

    return (
      params.get("token") ||
      params.get("bench") ||
      params.get("qr") ||
      ""
    );
  }

  async function api(
    url,
    options = {}
  ) {

    const response =
      await fetch(url, {
        method:
          options.method || "GET",

        credentials: "include",

        cache: "no-store",

        headers: {
          ...(options.body
            ? {
                "Content-Type":
                  "application/json"
              }
            : {}),

          ...(options.headers || {})
        },

        body:
          options.body
      });

    let data = null;

    try {
      data =
        await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {

      throw new Error(
        data?.error ||
        `Request failed (${response.status})`
      );
    }

    return data;
  }

  function quantity(id) {
    return Number(
      state.cart.get(id) || 0
    );
  }

  function cartItems() {

    return [
      ...state.cart.entries()
    ]
      .map(([id, qty]) => {

        const item =
          state.menu.find(
            x => x.id === id
          );

        if (!item) {
          return null;
        }

        return {
          item,
          quantity: qty
        };
      })
      .filter(Boolean);
  }

  function cartCount() {

    return cartItems()
      .reduce(
        (sum, x) =>
          sum + x.quantity,
        0
      );
  }

  function cartTotal() {

    return cartItems()
      .reduce(
        (sum, x) =>
          sum +
          Number(x.item.price) *
          x.quantity,
        0
      );
  }

  function add(id) {

    const item =
      state.menu.find(
        x => x.id === id
      );

    if (!item) return;

    state.cart.set(
      id,
      quantity(id) + 1
    );

    render();
  }

  function remove(id) {

    const qty =
      quantity(id);

    if (qty <= 1) {
      state.cart.delete(id);
    } else {
      state.cart.set(
        id,
        qty - 1
      );
    }

    render();
  }

  function categories() {

    const values =
      new Set();

    for (const item of state.menu) {

      const category =
        String(
          item.category ||
          "Other"
        ).trim();

      if (category) {
        values.add(category);
      }
    }

    return [
      "ALL",
      ...values
    ];
  }

  function visibleMenu() {

    if (
      state.category ===
      "ALL"
    ) {
      return state.menu;
    }

    return state.menu.filter(
      item =>
        String(
          item.category ||
          "Other"
        ).trim() ===
        state.category
    );
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  function render() {

    if (!root) return;

    if (state.loading) {

      root.innerHTML = `
        <div class="screen-loading">
          <div class="loader"></div>
          <div>Loading menu...</div>
        </div>
      `;

      return;
    }

    if (state.order) {

      renderSuccess();

      return;
    }

    renderMenu();
  }

  function renderMenu() {

    const cats =
      categories();

    const items =
      visibleMenu();

    root.innerHTML = `

      <header class="customer-header">

        <div class="customer-header-inner">

          <div class="brand-area">

            <div class="brand-name">
              ${esc(
                state.branch?.name ||
                "Restaurant"
              )}
            </div>

            <div class="brand-address">
              ${esc(
                state.branch?.address ||
                ""
              )}
            </div>

          </div>

          <div class="table-pill">
            ${esc(
              state.bench?.label ||
              "Table"
            )}
          </div>

        </div>

      </header>

      <main class="customer-main">

        <nav class="category-scroll">

          ${cats.map(
            category => `

              <button
                type="button"
                class="category-btn ${
                  state.category ===
                  category
                    ? "active"
                    : ""
                }"
                data-category="${esc(
                  category
                )}"
              >
                ${
                  category === "ALL"
                    ? "All"
                    : esc(category)
                }
              </button>

            `
          ).join("")}

        </nav>

        ${
          items.length
            ? `
              <section class="menu-grid">

                ${items
                  .map(
                    renderItem
                  )
                  .join("")}

              </section>
            `
            : `
              <section class="empty-screen">

                <div>

                  <div class="empty-title">
                    No items available
                  </div>

                  <div class="empty-text">
                    Please choose another category.
                  </div>

                </div>

              </section>
            `
        }

      </main>

      ${
        cartCount() > 0
          ? `

            <div class="cart-bar">

              <div class="cart-meta">

                <div class="cart-count">
                  ${cartCount()}
                  ${
                    cartCount() === 1
                      ? " item"
                      : " items"
                  }
                </div>

                <div class="cart-total">
                  ${money(
                    cartTotal()
                  )}
                </div>

              </div>

              <button
                type="button"
                id="view-cart"
                class="cart-btn"
              >
                View Cart
              </button>

            </div>

          `
          : ""
      }

    `;

    bindMenuEvents();
  }

  function renderItem(item) {

    const qty =
      quantity(item.id);

    const image =
      item.imageUrl ||
      item.image ||
      item.photoUrl ||
      "";

    return `

      <article class="menu-card">

        ${
          image
            ? `

              <img
                class="menu-photo"
                src="${esc(image)}"
                alt="${esc(item.name)}"
                loading="lazy"
                onerror="
                  this.style.display='none';
                  this.nextElementSibling.style.display='grid';
                "
              >

              <div
                class="menu-placeholder"
                style="display:none"
              >
                🍽️
              </div>

            `
            : `

              <div class="menu-placeholder">
                🍽️
              </div>

            `
        }

        <div class="menu-content">

          <div class="menu-name">
            ${esc(item.name)}
          </div>

          <div class="menu-description">
            ${esc(
              item.description ||
              ""
            )}
          </div>

          <div class="menu-footer">

            <div class="menu-price">
              ${money(
                item.price
              )}
            </div>

            ${
              qty === 0
                ? `

                  <button
                    type="button"
                    class="add-btn"
                    data-add="${esc(
                      item.id
                    )}"
                  >
                    ADD
                  </button>

                `
                : `

                  <div class="qty-control">

                    <button
                      type="button"
                      class="qty-btn"
                      data-remove="${esc(
                        item.id
                      )}"
                    >
                      −
                    </button>

                    <span class="qty-number">
                      ${qty}
                    </span>

                    <button
                      type="button"
                      class="qty-btn"
                      data-add="${esc(
                        item.id
                      )}"
                    >
                      +
                    </button>

                  </div>

                `
            }

          </div>

        </div>

      </article>
    `;
  }

  function bindMenuEvents() {

    document
      .querySelectorAll(
        "[data-category]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            state.category =
              button.dataset.category ||
              "ALL";

            render();
          }
        );
      });

    document
      .querySelectorAll(
        "[data-add]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            add(
              button.dataset.add
            );
          }
        );
      });

    document
      .querySelectorAll(
        "[data-remove]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            remove(
              button.dataset.remove
            );
          }
        );
      });

    document
      .getElementById(
        "view-cart"
      )
      ?.addEventListener(
        "click",
        openCart
      );
  }

  /* ==========================================================
     CART MODAL
     ========================================================== */

  function openCart() {

    if (!cartItems().length) {
      return;
    }

    const html = `

      <div
        id="cart-backdrop"
        class="modal-backdrop"
      >

        <section class="modal">

          <div class="modal-header">

            <div class="modal-title">
              Your Order
            </div>

            <button
              id="close-cart"
              type="button"
              class="close-btn"
            >
              ×
            </button>

          </div>

          <div>

            ${cartItems()
              .map(
                renderCartLine
              )
              .join("")}

          </div>

          <div
            style="
              display:flex;
              justify-content:space-between;
              gap:12px;
              margin-top:18px;
              font-size:20px;
              font-weight:950;
            "
          >

            <span>
              Total
            </span>

            <span>
              ${money(
                cartTotal()
              )}
            </span>

          </div>

          <form
            id="checkout-form"
            class="checkout-form"
          >

            <div>

              <div class="field-label">
                Name
              </div>

              <input
                class="field"
                name="customerName"
                maxlength="80"
                autocomplete="name"
                required
              >

            </div>

            <div>

              <div class="field-label">
                Phone
              </div>

              <input
                class="field"
                name="customerPhone"
                maxlength="20"
                inputmode="tel"
                autocomplete="tel"
                required
              >

            </div>

            <div>

              <div class="field-label">
                Special instructions
              </div>

              <textarea
                class="field"
                name="notes"
                maxlength="500"
                placeholder="Optional"
              ></textarea>

            </div>

            <button
              id="place-order"
              type="submit"
              class="primary-btn"
            >
              Place Order ·
              ${money(
                cartTotal()
              )}
            </button>

          </form>

        </section>

      </div>
    `;

    document.body.insertAdjacentHTML(
      "beforeend",
      html
    );

    const backdrop =
      document.getElementById(
        "cart-backdrop"
      );

    document
      .getElementById(
        "close-cart"
      )
      ?.addEventListener(
        "click",
        () => backdrop?.remove()
      );

    backdrop?.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          backdrop
        ) {
          backdrop.remove();
        }

      }
    );

    document
      .querySelectorAll(
        "[data-cart-add]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            add(
              button.dataset.cartAdd
            );

            backdrop.remove();

            openCart();
          }
        );
      });

    document
      .querySelectorAll(
        "[data-cart-remove]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            remove(
              button.dataset.cartRemove
            );

            backdrop.remove();

            if (
              cartItems().length
            ) {
              openCart();
            }

          }
        );
      });

    document
      .getElementById(
        "checkout-form"
      )
      ?.addEventListener(
        "submit",
        submitOrder
      );
  }

  function renderCartLine(data) {

    const item =
      data.item;

    return `

      <div class="cart-line">

        <div>

          <div class="cart-line-name">
            ${esc(
              item.name
            )}
          </div>

          <div class="cart-line-sub">
            ${money(
              item.price
            )}
            ×
            ${data.quantity}
          </div>

          <div class="cart-line-total">
            ${money(
              Number(item.price) *
              data.quantity
            )}
          </div>

        </div>

        <div class="qty-control">

          <button
            type="button"
            class="qty-btn"
            data-cart-remove="${esc(
              item.id
            )}"
          >
            −
          </button>

          <span class="qty-number">
            ${data.quantity}
          </span>

          <button
            type="button"
            class="qty-btn"
            data-cart-add="${esc(
              item.id
            )}"
          >
            +
          </button>

        </div>

      </div>
    `;
  }

  /* ==========================================================
     ORDER
     ========================================================== */

  async function submitOrder(event) {

    event.preventDefault();

    if (
      state.submitting
    ) {
      return;
    }

    const form =
      event.currentTarget;

    const data =
      new FormData(form);

    const customerName =
      String(
        data.get(
          "customerName"
        ) || ""
      ).trim();

    const customerPhone =
      String(
        data.get(
          "customerPhone"
        ) || ""
      ).trim();

    const notes =
      String(
        data.get(
          "notes"
        ) || ""
      ).trim();

    if (!customerName) {
      alert(
        "Please enter your name."
      );
      return;
    }

    const phoneDigits =
      customerPhone.replace(
        /\D/g,
        ""
      );

    if (
      phoneDigits.length < 10
    ) {
      alert(
        "Please enter a valid phone number."
      );
      return;
    }

    const items =
      cartItems();

    if (!items.length) {
      alert(
        "Your cart is empty."
      );
      return;
    }

    state.submitting =
      true;

    const button =
      document.getElementById(
        "place-order"
      );

    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Placing order...";
    }

    const clientRequestId =
      `QR-${crypto.randomUUID()}`;

    try {

      const response =
        await api(
          "/api/orders",
          {
            method: "POST",

            body:
              JSON.stringify({
                branchId:
                  state.branch.id,

                benchId:
                  state.bench.id,

                source:
                  "QR",

                clientRequestId,

                customerName,

                customerPhone,

                notes,

                lines:
                  items.map(
                    x => ({
                      menuItemId:
                        x.item.id,

                      quantity:
                        x.quantity
                    })
                  )
              })
          }
        );

      state.order =
        response;

      state.cart.clear();

      document
        .getElementById(
          "cart-backdrop"
        )
        ?.remove();

      state.submitting =
        false;

      render();

      startStatusPolling();

    } catch (error) {

      state.submitting =
        false;

      if (button) {

        button.disabled =
          false;

        button.textContent =
          `Place Order · ${money(
            cartTotal()
          )}`;
      }

      alert(
        error?.message ||
        "Could not place order. Please try again."
      );
    }
  }

  /* ==========================================================
     ORDER STATUS
     ========================================================== */

  function renderSuccess() {

    const status =
      String(
        state.order?.status ||
        "PENDING"
      );

    root.innerHTML = `

      <header class="customer-header">

        <div class="customer-header-inner">

          <div class="brand-area">

            <div class="brand-name">
              ${esc(
                state.branch?.name ||
                "Restaurant"
              )}
            </div>

            <div class="brand-address">
              ${esc(
                state.bench?.label ||
                "Table"
              )}
            </div>

          </div>

        </div>

      </header>

      <main class="customer-main">

        <section class="success-screen">

          <div class="success-card">

            <div class="success-icon">
              ✓
            </div>

            <div class="success-title">
              Order Placed
            </div>

            <div class="order-number">
              Order #
              ${esc(
                state.order?.number ||
                ""
              )}
            </div>

            <div class="status-pill">
              ${esc(status)}
            </div>

            <div class="status-text">

              Your order has been
              sent to the restaurant.

              <br>

              Total:
              <strong>
                ${money(
                  state.order?.total
                )}
              </strong>

            </div>

            <button
              id="refresh-status"
              class="primary-btn"
              type="button"
              style="margin-top:20px"
            >
              Refresh Status
            </button>

          </div>

        </section>

      </main>
    `;

    document
      .getElementById(
        "refresh-status"
      )
      ?.addEventListener(
        "click",
        refreshStatus
      );
  }

  async function refreshStatus() {

    if (
      !state.order?.id
    ) {
      return;
    }

    try {

      const response =
        await api(
          `/api/public/orders/${encodeURIComponent(
            state.order.id
          )}`
        );

      state.order =
        response;

      render();

    } catch (error) {

      alert(
        error?.message ||
        "Could not refresh order."
      );
    }
  }

  function startStatusPolling() {

    if (
      state.statusTimer
    ) {
      clearInterval(
        state.statusTimer
      );
    }

    state.statusTimer =
      setInterval(
        async () => {

          if (
            !state.order?.id
          ) {
            return;
          }

          try {

            const response =
              await api(
                `/api/public/orders/${encodeURIComponent(
                  state.order.id
                )}`
              );

            state.order =
              response;

            render();

          } catch {
            // silent polling failure
          }

        },
        5000
      );
  }

  /* ==========================================================
     BOOT
     ========================================================== */

  async function boot() {

    state.token =
      tokenFromUrl();

    if (
      !state.token
    ) {

      state.loading =
        false;

      root.innerHTML = `

        <section class="empty-screen">

          <div>

            <div class="empty-title">
              Scan QR to Order
            </div>

            <div class="empty-text">
              Please scan the table QR code
              to open the menu.
            </div>

          </div>

        </section>

      `;

      return;
    }

    try {

      const data =
        await api(
          `/api/public/menu/${encodeURIComponent(
            state.token
          )}`
        );

      if (
        !data?.branch ||
        !data?.bench
      ) {
        throw new Error(
          "Invalid QR code."
        );
      }

      state.branch =
        data.branch;

      state.bench =
        data.bench;

      state.menu =
        Array.isArray(
          data.menu
        )
          ? data.menu
          : [];

      state.loading =
        false;

      render();

    } catch (error) {

      state.loading =
        false;

      root.innerHTML = `

        <section class="empty-screen">

          <div>

            <div class="empty-title">
              QR Code Unavailable
            </div>

            <div class="empty-text">
              ${esc(
                error?.message ||
                "This QR code is inactive."
              )}
            </div>

          </div>

        </section>

      `;
    }
  }

  boot();

})();
