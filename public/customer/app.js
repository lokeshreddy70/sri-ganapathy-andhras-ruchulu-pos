(() => {
  "use strict";

  const state = {
    token: "",
    branch: null,
    bench: null,
    menu: [],
    category: "ALL",
    cart: new Map()
  };

  const $ =
    id => document.getElementById(id);

  const money =
    value =>
      `₹${Number(value || 0).toFixed(2)}`;

  const escapeHtml =
    value =>
      String(value ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");

  async function api(
    url,
    options = {}
  ) {

    const response =
      await fetch(
        url,
        {
          headers: {
            "Content-Type":
              "application/json"
          },
          ...options
        }
      );

    const data =
      await response
        .json()
        .catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.error ||
        "Request failed"
      );
    }

    return data;
  }

  function getToken() {

    const parts =
      location.pathname
        .split("/")
        .filter(Boolean);

    if (
      parts[0] !== "order" ||
      !parts[1]
    ) {
      return "";
    }

    return decodeURIComponent(
      parts[1]
    );
  }

  async function load() {

    state.token =
      getToken();

    if (!state.token) {
      throw new Error(
        "Invalid QR code"
      );
    }

    const data =
      await api(
        `/api/public/menu/${encodeURIComponent(state.token)}`
      );

    state.branch =
      data.branch;

    state.bench =
      data.bench;

    state.menu =
      data.menu || [];

    $("branchName")
      .textContent =
      state.branch.name;

    $("benchName")
      .textContent =
      state.bench.label;

    if (
      state.branch.logoUrl
    ) {
      $("branchLogo")
        .src =
        state.branch.logoUrl;
    }

    renderCategories();
    renderMenu();

    $("loading")
      .classList.add(
        "hidden"
      );

    $("customerApp")
      .classList.remove(
        "hidden"
      );
  }

  function renderCategories() {

    const categories = [
      "ALL",
      ...new Set(
        state.menu
          .map(x =>
            x.category
          )
          .filter(Boolean)
      )
    ];

    $("customerCategories")
      .innerHTML =
      categories
        .map(
          category => `
            <button
              class="customer-category ${
                state.category ===
                category
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
          `
        )
        .join("");

    $("customerCategories")
      .querySelectorAll(
        "[data-category]"
      )
      .forEach(
        button => {

          button.onclick =
            () => {

              state.category =
                button.dataset.category;

              renderCategories();
              renderMenu();
            };
        }
      );
  }

  function renderMenu() {

    const items =
      state.menu.filter(
        item =>
          state.category ===
            "ALL" ||
          item.category ===
            state.category
      );

    $("customerMenu")
      .innerHTML =
      items
        .map(
          item => {

            const image =
              item.imageUrl ||
              "/brand/logo-primary.jpg";

            return `
              <article
                class="customer-item"
              >

                <img
                  src="${escapeHtml(image)}"
                  alt=""
                  onerror="this.src='/brand/logo-primary.jpg'"
                >

                <div
                  class="customer-item-body"
                >

                  <div
                    class="customer-item-name"
                  >
                    ${escapeHtml(item.name)}
                  </div>

                  <div
                    class="customer-item-description"
                  >
                    ${escapeHtml(
                      item.description ||
                      item.category ||
                      ""
                    )}
                  </div>

                  <div
                    class="customer-item-bottom"
                  >

                    <span
                      class="customer-item-price"
                    >
                      ${money(item.price)}
                    </span>

                    <button
                      class="customer-add"
                      data-add="${item.id}"
                      ${
                        item.soldOut
                          ? "disabled"
                          : ""
                      }
                    >
                      ${
                        item.soldOut
                          ? "Sold out"
                          : "Add"
                      }
                    </button>

                  </div>

                </div>

              </article>
            `;
          }
        )
        .join("");

    $("customerMenu")
      .querySelectorAll(
        "[data-add]"
      )
      .forEach(
        button => {

          button.onclick =
            () => {

              add(
                button.dataset.add
              );
            };
        }
      );
  }

  function add(id) {

    const item =
      state.menu.find(
        x => x.id === id
      );

    if (
      !item ||
      item.soldOut
    ) {
      return;
    }

    const line =
      state.cart.get(id);

    if (line) {
      line.quantity++;
    } else {
      state.cart.set(
        id,
        {
          menuItemId: id,
          quantity: 1
        }
      );
    }

    renderCartCount();
  }

  function change(
    id,
    amount
  ) {

    const line =
      state.cart.get(id);

    if (!line) return;

    line.quantity +=
      amount;

    if (
      line.quantity <= 0
    ) {
      state.cart.delete(id);
    }

    renderCartCount();
    renderCart();
  }

  function renderCartCount() {

    const count =
      [...state.cart.values()]
        .reduce(
          (sum,line) =>
            sum + line.quantity,
          0
        );

    $("cartCount")
      .textContent =
      count;
  }

  function calculate() {

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

    const tax =
      state.branch.taxEnabled
        ? subtotal *
          (Number(
            state.branch.taxRate ||
            0
          ) / 100)
        : 0;

    return {
      subtotal,
      tax,
      total:
        subtotal + tax
    };
  }

  function renderCart() {

    const container =
      $("cartItems");

    if (
      state.cart.size === 0
    ) {

      container.innerHTML = `
        <div
          style="
            padding:35px 0;
            text-align:center;
            color:#777;
          "
        >
          Your cart is empty
        </div>
      `;

      $("cartTotal")
        .textContent =
        money(0);

      return;
    }

    container.innerHTML =
      [...state.cart.values()]
        .map(
          line => {

            const item =
              state.menu.find(
                x =>
                  x.id ===
                  line.menuItemId
              );

            if (!item) {
              return "";
            }

            return `
              <div
                class="customer-cart-row"
              >

                <div>

                  <strong>
                    ${escapeHtml(item.name)}
                  </strong>

                  <br>

                  <small>
                    ${money(item.price)}
                  </small>

                  <div
                    class="customer-qty"
                  >

                    <button
                      data-minus="${item.id}"
                    >
                      −
                    </button>

                    <strong>
                      ${line.quantity}
                    </strong>

                    <button
                      data-plus="${item.id}"
                    >
                      +
                    </button>

                  </div>

                </div>

                <strong>
                  ${money(
                    Number(item.price) *
                    line.quantity
                  )}
                </strong>

              </div>
            `;
          }
        )
        .join("");

    container
      .querySelectorAll(
        "[data-minus]"
      )
      .forEach(
        button =>
          button.onclick =
            () =>
              change(
                button.dataset.minus,
                -1
              )
      );

    container
      .querySelectorAll(
        "[data-plus]"
      )
      .forEach(
        button =>
          button.onclick =
            () =>
              change(
                button.dataset.plus,
                1
              )
      );

    const totals =
      calculate();

    $("cartTotal")
      .textContent =
      money(totals.total);
  }

  async function placeOrder() {

    if (
      state.cart.size === 0
    ) {
      return;
    }

    const button =
      $("placeOrder");

    button.disabled = true;
    button.textContent =
      "Sending...";

    try {

      const response =
        await api(
          "/api/orders",
          {
            method: "POST",
            body:
              JSON.stringify({
                source: "QR",

                branchId:
                  state.branch.id,

                benchId:
                  state.bench.id,

                clientRequestId:
                  crypto.randomUUID
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random()}`,

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
                  $("customerNotes")
                    .value
                    .trim() ||
                  undefined,

                lines:
                  [...state.cart.values()]
                    .map(line => ({
                      menuItemId:
                        line.menuItemId,
                      quantity:
                        line.quantity
                    }))
              })
          }
        );

      state.cart.clear();

      $("customerName")
        .value = "";

      $("customerPhone")
        .value = "";

      $("customerNotes")
        .value = "";

      renderCartCount();
      renderCart();

      $("successNumber")
        .textContent =
        response.order?.invoiceNumber
          ? `Order ${response.order.invoiceNumber}`
          : `Order #${response.order?.number || ""}`;

      $("cartDrawer")
        .classList.add(
          "hidden"
        );

      $("successModal")
        .classList.remove(
          "hidden"
        );

    } catch (error) {

      alert(
        error.message ||
        "Unable to place order"
      );

    } finally {

      button.disabled = false;
      button.textContent =
        "Place Order";
    }
  }

  function bind() {

    $("cartButton")
      .onclick =
      () => {

        renderCart();

        $("cartDrawer")
          .classList.remove(
            "hidden"
          );
      };

    $("closeCart")
      .onclick =
      () =>
        $("cartDrawer")
          .classList.add(
            "hidden"
          );

    $("placeOrder")
      .onclick =
      placeOrder;

    $("continueOrdering")
      .onclick =
      () =>
        $("successModal")
          .classList.add(
            "hidden"
          );

  }

  bind();

  load()
    .catch(
      error => {

        $("loading")
          .innerHTML = `
            <div
              style="
                text-align:center;
                padding:30px;
              "
            >
              <strong>
                Unable to load this QR
              </strong>

              <div
                style="
                  margin-top:7px;
                  color:#777;
                  font-size:12px;
                "
              >
                ${escapeHtml(
                  error.message
                )}
              </div>
            </div>
          `;
      }
    );

})();