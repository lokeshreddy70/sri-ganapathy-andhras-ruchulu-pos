(() => {

  "use strict";

  const state = {
    user: null,
    branchId: null,
    timer: null
  };

  const $ =
    id =>
      document.getElementById(id);

  async function api(
    url,
    options = {}
  ) {

    const response =
      await fetch(
        url,
        {
          credentials:"include",
          headers:{
            "Content-Type":
              "application/json"
          },
          ...options
        }
      );

    const data =
      await response
        .json()
        .catch(
          () => null
        );

    if (!response.ok) {
      throw new Error(
        data?.error ||
        "Request failed"
      );
    }

    return data;
  }

  async function me() {

    try {

      const data =
        await api(
          "/api/me"
        );

      state.user =
        data.user;

      if (
        !state.user.branchId &&
        state.user.role !==
          "SUPER_ADMIN"
      ) {
        throw new Error(
          "No branch assigned"
        );
      }

      return true;

    } catch {

      return false;
    }
  }

  async function login(
    username,
    password
  ) {

    const error =
      $("loginError");

    error.classList.add(
      "hidden"
    );

    try {

      const data =
        await api(
          "/api/auth/login",
          {
            method:"POST",
            body:
              JSON.stringify({
                username,
                password
              })
          }
        );

      state.user =
        data.user;

      await start();

    } catch (err) {

      error.textContent =
        err.message;

      error.classList.remove(
        "hidden"
      );
    }
  }

  function statusButton(
    order,
    nextStatus,
    label
  ) {

    return `
      <button
        class="next"
        data-order="${order.id}"
        data-status="${nextStatus}"
      >
        ${label}
      </button>
    `;
  }

  function renderOrders(
    orders
  ) {

    const groups = {
      PENDING:
        $("pending"),

      PREPARING:
        $("preparing"),

      READY:
        $("ready")
    };

    Object.values(
      groups
    ).forEach(
      element =>
        element.innerHTML = ""
    );

    const counts = {
      PENDING:0,
      PREPARING:0,
      READY:0
    };

    orders.forEach(
      order => {

        if (
          !groups[order.status]
        ) {
          return;
        }

        counts[
          order.status
        ]++;

        const card =
          document.createElement(
            "article"
          );

        card.className =
          "kds-order";

        const lines =
          (order.lines || [])
            .map(
              line => `
                <div
                  class="kds-line"
                >
                  <span>
                    ${
                      Number(
                        line.quantity
                      )
                    }
                    ×
                    ${
                      line.menuItem?.name ||
                      "Item"
                    }
                  </span>

                  <strong>
                    ₹${
                      Number(
                        line.lineTotal
                      ).toFixed(2)
                    }
                  </strong>
                </div>
              `
            )
            .join("");

        let action = "";

        if (
          order.status ===
          "PENDING"
        ) {
          action =
            statusButton(
              order,
              "PREPARING",
              "Start"
            );
        }

        if (
          order.status ===
          "PREPARING"
        ) {
          action =
            statusButton(
              order,
              "READY",
              "Ready"
            );
        }

        if (
          order.status ===
          "READY"
        ) {
          action =
            statusButton(
              order,
              "SERVED",
              "Served"
            );
        }

        card.innerHTML = `
          <div
            class="kds-order-head"
          >
            <strong>
              ${
                order.invoiceNumber ||
                `#${order.number}`
              }
            </strong>

            <span>
              ${
                order.bench?.label ||
                "Counter"
              }
            </span>
          </div>

          ${
            order.customerName
              ? `
                <div
                  style="
                    font-size:11px;
                    color:#777;
                    margin-bottom:6px;
                  "
                >
                  ${order.customerName}
                </div>
              `
              : ""
          }

          ${lines}

          <div
            class="kds-actions"
          >
            ${action}
          </div>
        `;

        groups[
          order.status
        ].appendChild(
          card
        );
      }
    );

    $("pendingCount")
      .textContent =
      counts.PENDING;

    $("preparingCount")
      .textContent =
      counts.PREPARING;

    $("readyCount")
      .textContent =
      counts.READY;

    document
      .querySelectorAll(
        "[data-order][data-status]"
      )
      .forEach(
        button => {

          button.onclick =
            async () => {

              button.disabled =
                true;

              try {

                await api(
                  `/api/orders/${button.dataset.order}/status`,
                  {
                    method:"PATCH",
                    body:
                      JSON.stringify({
                        status:
                          button.dataset.status
                      })
                  }
                );

                await loadOrders();

              } catch (
                error
              ) {

                alert(
                  error.message
                );

                button.disabled =
                  false;
              }
            };
        }
      );
  }

  async function loadOrders() {

    if (
      !state.branchId
    ) {
      return;
    }

    const orders =
      await api(
        `/api/pos/orders?branchId=${encodeURIComponent(state.branchId)}`
      );

    /*
     * Server already applies branch scope.
     * This additional filter prevents accidental
     * cross-branch rendering if response changes.
     */

    const branchOrders =
      orders.filter(
        order =>
          order.branch?.id ===
          state.branchId
      );

    renderOrders(
      branchOrders.filter(
        order =>
          [
            "PENDING",
            "PREPARING",
            "READY"
          ].includes(
            order.status
          )
      )
    );
  }

  async function start() {

    $("login")
      .classList.add(
        "hidden"
      );

    $("board")
      .classList.remove(
        "hidden"
      );

    state.branchId =
      state.user.branchId;

    const branches =
      await api(
        "/api/branches"
      );

    const branch =
      branches.find(
        x =>
          x.id ===
          state.branchId
      ) ||
      branches[0];

    if (!branch) {
      throw new Error(
        "Branch not found"
      );
    }

    state.branchId =
      branch.id;

    $("branchName")
      .textContent =
      branch.name;

    await loadOrders();

    state.timer =
      setInterval(
        () => {
          loadOrders()
            .catch(
              () => {}
            );
        },
        3000
      );
  }

  $("loginForm")
    .addEventListener(
      "submit",
      event => {

        event.preventDefault();

        login(
          $("username")
            .value
            .trim(),
          $("password")
            .value
        );
      }
    );

  $("logout")
    .addEventListener(
      "click",
      async () => {

        try {
          await api(
            "/api/auth/logout",
            {
              method:"POST",
              body:"{}"
            }
          );
        } catch {}

        if (state.timer) {
          clearInterval(
            state.timer
          );
        }

        location.reload();
      }
    );

  (async () => {

    if (
      await me()
    ) {

      try {
        await start();
      } catch (error) {
        $("loginError")
          .textContent =
          error.message;
      }

    }

  })();

})();