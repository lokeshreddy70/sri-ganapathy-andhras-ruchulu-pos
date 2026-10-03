(() => {

  "use strict";

  const state = {
    user:null,
    branches:[],
    menu:[],
    benches:[],
    users:[],
    branch:null
  };

  const $ =
    id =>
      document.getElementById(id);

  const escapeHtml =
    value =>
      String(value ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");

  const money =
    value =>
      `₹${Number(value || 0).toFixed(2)}`;

  async function api(
    url,
    options={}
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

  function toast(
    message
  ) {

    const el =
      $("adminToast");

    el.textContent =
      message;

    el.classList.remove(
      "hidden"
    );

    clearTimeout(
      toast.timer
    );

    toast.timer =
      setTimeout(
        () =>
          el.classList.add(
            "hidden"
          ),
        2500
      );
  }

  function modal(
    id,
    open=true
  ) {

    $(id).classList.toggle(
      "hidden",
      !open
    );
  }

  async function getMe() {

    const data =
      await api(
        "/api/me"
      );

    state.user =
      data.user;

    if (
      ![
        "SUPER_ADMIN",
        "ADMIN"
      ].includes(
        state.user.role
      )
    ) {
      throw new Error(
        "Administrator access required"
      );
    }
  }

  async function loadBranches() {

    state.branches =
      await api(
        "/api/branches"
      );

    state.branch =
      state.branches.find(
        branch =>
          branch.id ===
          state.user.branchId
      ) ||
      state.branches[0] ||
      null;

    renderBranches();
    populateBranchSelects();

    if (state.branch) {
      fillSettings(
        state.branch
      );
    }
  }

  async function loadMenu() {

    if (!state.branch) {
      return;
    }

    state.menu =
      await api(
        `/api/menu?branchId=${encodeURIComponent(state.branch.id)}`
      );

    renderMenu();
  }

  async function loadBenches() {

    if (!state.branch) {
      return;
    }

    state.benches =
      await api(
        `/api/benches?branchId=${encodeURIComponent(state.branch.id)}`
      );

    renderBenches();
  }

  async function loadUsers() {

    /*
     * User CRUD is intentionally limited to the
     * endpoint implemented below.
     * Existing accounts remain untouched.
     */

    if (!state.branch) {
      return;
    }

    try {

      const data =
        await api(
          `/api/users?branchId=${encodeURIComponent(state.branch.id)}`
        );

      state.users =
        Array.isArray(data)
          ? data
          : [];

    } catch {

      state.users = [];

    }

    renderUsers();
  }

  function renderMenu() {

    $("menuAdminList")
      .innerHTML =
      state.menu.length
        ? state.menu.map(
            item => `
              <div
                class="admin-list-item"
              >

                <div>

                  <div
                    class="admin-item-title"
                  >
                    ${escapeHtml(item.name)}
                  </div>

                  <div
                    class="admin-item-meta"
                  >
                    ${escapeHtml(item.category)}
                    ·
                    ${money(item.price)}
                    ·
                    ${
                      item.active
                        ? "Active"
                        : "Inactive"
                    }
                    ·
                    ${
                      item.soldOut
                        ? "Sold out"
                        : "Available"
                    }
                  </div>

                </div>

                <div
                  class="admin-item-actions"
                >

                  <button
                    class="admin-edit"
                    data-menu-edit="${item.id}"
                  >
                    Edit
                  </button>

                  <button
                    class="admin-sold"
                    data-menu-sold="${item.id}"
                  >
                    ${
                      item.soldOut
                        ? "Available"
                        : "Sold out"
                    }
                  </button>

                  <button
                    class="admin-delete"
                    data-menu-delete="${item.id}"
                  >
                    Delete
                  </button>

                </div>

              </div>
            `
          ).join("")
        : `
          <div
            class="admin-list-item"
          >
            No menu items
          </div>
        `;

    document
      .querySelectorAll(
        "[data-menu-edit]"
      )
      .forEach(
        button =>
          button.onclick =
            () =>
              editMenu(
                button.dataset.menuEdit
              )
      );

    document
      .querySelectorAll(
        "[data-menu-sold]"
      )
      .forEach(
        button =>
          button.onclick =
            () =>
              toggleSold(
                button.dataset.menuSold
              )
      );

    document
      .querySelectorAll(
        "[data-menu-delete]"
      )
      .forEach(
        button =>
          button.onclick =
            () =>
              deleteMenu(
                button.dataset.menuDelete
              )
      );
  }

  function editMenu(
    id
  ) {

    const item =
      state.menu.find(
        x => x.id === id
      );

    if (!item) {
      return;
    }

    $("menuModalTitle")
      .textContent =
      "Edit Menu Item";

    $("menuId")
      .value =
      item.id;

    $("menuName")
      .value =
      item.name;

    $("menuCategory")
      .value =
      item.category;

    $("menuPrice")
      .value =
      item.price;

    $("menuTax")
      .value =
      item.taxRate ?? "";

    $("menuHsn")
      .value =
      item.hsnCode || "";

    $("menuBarcode")
      .value =
      item.barcode || "";

    $("menuImage")
      .value =
      item.imageUrl || "";

    $("menuSort")
      .value =
      item.sortOrder || 0;

    $("menuDescription")
      .value =
      item.description || "";

    $("menuActive")
      .checked =
      item.active;

    $("menuSoldOut")
      .checked =
      item.soldOut;

    modal(
      "menuModal"
    );
  }

  async function toggleSold(
    id
  ) {

    const item =
      state.menu.find(
        x => x.id === id
      );

    if (!item) return;

    try {

      await api(
        `/api/menu/${id}`,
        {
          method:"PATCH",
          body:
            JSON.stringify({
              soldOut:
                !item.soldOut
            })
        }
      );

      await loadMenu();

      toast(
        item.soldOut
          ? "Item available"
          : "Item marked sold out"
      );

    } catch (error) {

      toast(
        error.message
      );
    }
  }

  async function deleteMenu(
    id
  ) {

    if (
      !confirm(
        "Remove this menu item?"
      )
    ) {
      return;
    }

    try {

      await api(
        `/api/menu/${id}`,
        {
          method:"DELETE",
          body:"{}"
        }
      );

      await loadMenu();

      toast(
        "Menu item removed"
      );

    } catch (error) {

      toast(
        error.message
      );
    }
  }

  function resetMenuForm() {

    $("menuModalTitle")
      .textContent =
      "Add Menu Item";

    $("menuId")
      .value = "";

    $("menuName")
      .value = "";

    $("menuCategory")
      .value = "";

    $("menuPrice")
      .value = "";

    $("menuTax")
      .value = "";

    $("menuHsn")
      .value = "";

    $("menuBarcode")
      .value = "";

    $("menuImage")
      .value = "";

    $("menuSort")
      .value = "0";

    $("menuDescription")
      .value = "";

    $("menuActive")
      .checked = true;

    $("menuSoldOut")
      .checked = false;
  }

  async function saveMenu(
    event
  ) {

    event.preventDefault();

    const id =
      $("menuId").value;

    const payload = {
      branchId:
        state.branch.id,

      name:
        $("menuName")
          .value
          .trim(),

      category:
        $("menuCategory")
          .value
          .trim(),

      price:
        Number(
          $("menuPrice")
            .value
        ),

      taxRate:
        $("menuTax")
          .value === ""
          ? undefined
          : Number(
              $("menuTax")
                .value
            ),

      hsnCode:
        $("menuHsn")
          .value
          .trim() ||
        undefined,

      barcode:
        $("menuBarcode")
          .value
          .trim() ||
        undefined,

      imageUrl:
        $("menuImage")
          .value
          .trim() ||
        undefined,

      sortOrder:
        Number(
          $("menuSort")
            .value ||
          0
        ),

      description:
        $("menuDescription")
          .value
          .trim() ||
        undefined,

      active:
        $("menuActive")
          .checked,

      soldOut:
        $("menuSoldOut")
          .checked
    };

    try {

      if (id) {

        await api(
          `/api/menu/${id}`,
          {
            method:"PATCH",
            body:
              JSON.stringify(
                payload
              )
          }
        );

      } else {

        await api(
          "/api/menu",
          {
            method:"POST",
            body:
              JSON.stringify(
                payload
              )
          }
        );
      }

      modal(
        "menuModal",
        false
      );

      await loadMenu();

      toast(
        "Menu saved"
      );

    } catch (error) {

      toast(
        error.message
      );
    }
  }

  function renderBranches() {

    $("branchList")
      .innerHTML =
      state.branches
        .map(
          branch => `
            <div
              class="admin-list-item"
            >

              <div>

                <div
                  class="admin-item-title"
                >
                  ${escapeHtml(
                    branch.name
                  )}
                </div>

                <div
                  class="admin-item-meta"
                >
                  ${escapeHtml(
                    branch.code
                  )}
                  ·
                  ${
                    branch.active
                      ? "Active"
                      : "Inactive"
                  }
                </div>

              </div>

              <div
                class="admin-item-actions"
              >

                <button
                  class="admin-edit"
                  data-branch-edit="${branch.id}"
                >
                  Edit
                </button>

              </div>

            </div>
          `
        )
        .join("");

    document
      .querySelectorAll(
        "[data-branch-edit]"
      )
      .forEach(
        button =>
          button.onclick =
            () =>
              editBranch(
                button.dataset.branchEdit
              )
      );
  }

  function editBranch(
    id
  ) {

    const branch =
      state.branches.find(
        x => x.id === id
      );

    if (!branch) return;

    $("branchId")
      .value =
      branch.id;

    $("branchNameInput")
      .value =
      branch.name;

    $("branchCodeInput")
      .value =
      branch.code;

    $("branchSlugInput")
      .value =
      branch.slug;

    $("branchPhoneInput")
      .value =
      branch.phone || "";

    $("branchAddressInput")
      .value =
      branch.address || "";

    modal(
      "branchModal"
    );
  }

  async function saveBranch(
    event
  ) {

    event.preventDefault();

    const id =
      $("branchId")
        .value;

    const payload = {
      name:
        $("branchNameInput")
          .value
          .trim(),

      code:
        $("branchCodeInput")
          .value
          .trim()
          .toUpperCase(),

      slug:
        $("branchSlugInput")
          .value
          .trim(),

      phone:
        $("branchPhoneInput")
          .value
          .trim() ||
        null,

      address:
        $("branchAddressInput")
          .value
          .trim() ||
        null
    };

    try {

      if (id) {

        await api(
          `/api/branches/${id}`,
          {
            method:"PATCH",
            body:
              JSON.stringify(
                payload
              )
          }
        );

      } else {

        await api(
          "/api/branches",
          {
            method:"POST",
            body:
              JSON.stringify(
                payload
              )
          }
        );
      }

      modal(
        "branchModal",
        false
      );

      await loadBranches();

      toast(
        "Branch saved"
      );

    } catch (error) {

      toast(
        error.message
      );
    }
  }

  function populateBranchSelects() {

    const html =
      state.branches
        .map(
          branch => `
            <option
              value="${branch.id}"
            >
              ${escapeHtml(
                branch.name
              )}
            </option>
          `
        )
        .join("");

    $("benchBranch")
      .innerHTML =
      html;

    $("userBranch")
      .innerHTML =
      html;
  }

  function renderBenches() {

    $("benchList")
      .innerHTML =
      state.benches.length
        ? state.benches
            .map(
              bench => `
                <div
                  class="admin-list-item"
                >

                  <div>

                    <div
                      class="admin-item-title"
                    >
                      ${escapeHtml(
                        bench.label
                      )}
                    </div>

                    <div
                      class="admin-item-meta"
                    >
                      ${
                        bench.active
                          ? "Active"
                          : "Inactive"
                      }
                    </div>

                  </div>

                  <div
                    class="admin-item-actions"
                  >

                    <a
                      class="admin-edit"
                      href="/api/qr/${encodeURIComponent(bench.token)}.png"
                      target="_blank"
                      rel="noopener"
                      style="
                        text-decoration:none;
                        display:inline-flex;
                        align-items:center;
                        min-height:34px;
                        padding:0 10px;
                        border-radius:8px;
                        font-size:11px;
                        font-weight:750;
                        color:#171717;
                      "
                    >
                      QR
                    </a>

                    <button
                      class="admin-sold"
                      data-bench-toggle="${bench.id}"
                    >
                      ${
                        bench.active
                          ? "Disable"
                          : "Enable"
                      }
                    </button>

                  </div>

                </div>
              `
            )
            .join("")
        : `
          <div class="admin-list-item">
            No QR locations
          </div>
        `;

    document
      .querySelectorAll(
        "[data-bench-toggle]"
      )
      .forEach(
        button =>
          button.onclick =
            async () => {

              try {

                await api(
                  `/api/benches/${button.dataset.benchToggle}`,
                  {
                    method:"PATCH",
                    body:
                      JSON.stringify({
                        active:
                          button.textContent
                            .trim() ===
                          "Enable"
                      })
                  }
                );

                await loadBenches();

                toast(
                  "QR location updated"
                );

              } catch (error) {

                toast(
                  error.message
                );
              }
            }
      );
  }

  async function saveBench(
    event
  ) {

    event.preventDefault();

    try {

      await api(
        "/api/benches",
        {
          method:"POST",
          body:
            JSON.stringify({
              branchId:
                $("benchBranch")
                  .value,

              label:
                $("benchLabel")
                  .value
                  .trim()
            })
        }
      );

      modal(
        "benchModal",
        false
      );

      await loadBenches();

      toast(
        "QR location created"
      );

    } catch (error) {

      toast(
        error.message
      );
    }
  }

  function renderUsers() {

    $("userList")
      .innerHTML =
      state.users.length
        ? state.users
            .map(
              user => `
                <div
                  class="admin-list-item"
                >

                  <div>

                    <div
                      class="admin-item-title"
                    >
                      ${escapeHtml(
                        user.name
                      )}
                    </div>

                    <div
                      class="admin-item-meta"
                    >
                      @${escapeHtml(
                        user.username
                      )}
                      ·
                      ${escapeHtml(
                        user.role
                      )}
                    </div>

                  </div>

                </div>
              `
            )
            .join("")
        : `
          <div
            class="admin-list-item"
          >
            User list is not available.
          </div>
        `;
  }

  function fillSettings(
    branch
  ) {

    $("setName")
      .value =
      branch.name || "";

    $("setCode")
      .value =
      branch.code || "";

    $("setAddress")
      .value =
      branch.address || "";

    $("setPhone")
      .value =
      branch.phone || "";

    $("setGstin")
      .value =
      branch.gstin || "";

    $("setInvoicePrefix")
      .value =
      branch.invoicePrefix ||
      "INV";

    $("setInvoiceTitle")
      .value =
      branch.invoiceTitle ||
      "TAX INVOICE";

    $("setPaperWidth")
      .value =
      branch.receiptPaperWidth ||
      80;

    $("setUpiId")
      .value =
      branch.upiId || "";

    $("setUpiName")
      .value =
      branch.upiName || "";

    $("setTaxRate")
      .value =
      branch.taxRate || 0;

    $("setLogoUrl")
      .value =
      branch.logoUrl || "";

    $("setTaxEnabled")
      .checked =
      !!branch.taxEnabled;

    $("setCash")
      .checked =
      branch.paymentCashEnabled !==
      false;

    $("setUpi")
      .checked =
      branch.paymentUpiEnabled !==
      false;

    $("setCard")
      .checked =
      branch.paymentCardEnabled !==
      false;

    $("setReceiptHeader")
      .value =
      branch.receiptHeader || "";

    $("setReceiptFooter")
      .value =
      branch.receiptFooter || "";
  }

  async function saveSettings(
    event
  ) {

    event.preventDefault();

    try {

      await api(
        `/api/branches/${state.branch.id}`,
        {
          method:"PATCH",
          body:
            JSON.stringify({

              name:
                $("setName")
                  .value
                  .trim(),

              code:
                $("setCode")
                  .value
                  .trim()
                  .toUpperCase(),

              address:
                $("setAddress")
                  .value
                  .trim() ||
                null,

              phone:
                $("setPhone")
                  .value
                  .trim() ||
                null,

              gstin:
                $("setGstin")
                  .value
                  .trim() ||
                null,

              invoicePrefix:
                $("setInvoicePrefix")
                  .value
                  .trim(),

              invoiceTitle:
                $("setInvoiceTitle")
                  .value
                  .trim(),

              receiptPaperWidth:
                Number(
                  $("setPaperWidth")
                    .value
                ),

              upiId:
                $("setUpiId")
                  .value
                  .trim() ||
                null,

              upiName:
                $("setUpiName")
                  .value
                  .trim() ||
                null,

              taxRate:
                Number(
                  $("setTaxRate")
                    .value ||
                  0
                ),

              logoUrl:
                $("setLogoUrl")
                  .value
                  .trim() ||
                null,

              taxEnabled:
                $("setTaxEnabled")
                  .checked,

              paymentCashEnabled:
                $("setCash")
                  .checked,

              paymentUpiEnabled:
                $("setUpi")
                  .checked,

              paymentCardEnabled:
                $("setCard")
                  .checked,

              receiptHeader:
                $("setReceiptHeader")
                  .value
                  .trim() ||
                null,

              receiptFooter:
                $("setReceiptFooter")
                  .value
                  .trim() ||
                null
            })
        }
      );

      await loadBranches();

      toast(
        "Settings saved"
      );

    } catch (error) {

      toast(
        error.message
      );
    }
  }

  async function createUser(
    event
  ) {

    event.preventDefault();

    try {

      await api(
        "/api/users",
        {
          method:"POST",
          body:
            JSON.stringify({

              name:
                $("userName")
                  .value
                  .trim(),

              username:
                $("userUsername")
                  .value
                  .trim(),

              password:
                $("userPassword")
                  .value,

              role:
                $("userRole")
                  .value,

              branchId:
                $("userBranch")
                  .value
            })
        }
      );

      modal(
        "userModal",
        false
      );

      await loadUsers();

      toast(
        "User created"
      );

    } catch (error) {

      toast(
        error.message
      );
    }
  }

  function switchTab(
    tab
  ) {

    document
      .querySelectorAll(
        ".admin-tab"
      )
      .forEach(
        button =>
          button.classList.toggle(
            "active",
            button.dataset.tab ===
              tab
          )
      );

    document
      .querySelectorAll(
        ".admin-section"
      )
      .forEach(
        section =>
          section.classList.toggle(
            "hidden",
            section.id !==
              `tab-${tab}`
          )
      );

    if (tab === "menu") {
      loadMenu();
    }

    if (tab === "branches") {
      loadBranches();
    }

    if (tab === "benches") {
      loadBenches();
    }

    if (tab === "users") {
      loadUsers();
    }
  }

  async function logout() {

    try {

      await api(
        "/api/auth/logout",
        {
          method:"POST",
          body:"{}"
        }
      );

    } catch {}

    location.reload();
  }

  function bind() {

    $("adminLoginForm")
      .addEventListener(
        "submit",
        async event => {

          event.preventDefault();

          const error =
            $("adminLoginError");

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
                      username:
                        $("adminUsername")
                          .value
                          .trim(),

                      password:
                        $("adminPassword")
                          .value
                    })
                }
              );

            state.user =
              data.user;

            await bootAdmin();

          } catch (err) {

            error.textContent =
              err.message;

            error.classList.remove(
              "hidden"
            );
          }
        }
      );

    $("adminLogout")
      .onclick =
      logout;

    document
      .querySelectorAll(
        "[data-tab]"
      )
      .forEach(
        button =>
          button.onclick =
            () =>
              switchTab(
                button.dataset.tab
              )
      );

    $("newMenuButton")
      .onclick =
      () => {

        resetMenuForm();
        modal("menuModal");
      };

    $("menuForm")
      .addEventListener(
        "submit",
        saveMenu
      );

    $("newBranchButton")
      .onclick =
      () => {

        $("branchId")
          .value = "";

        $("branchNameInput")
          .value = "";

        $("branchCodeInput")
          .value = "";

        $("branchSlugInput")
          .value = "";

        $("branchPhoneInput")
          .value = "";

        $("branchAddressInput")
          .value = "";

        modal("branchModal");
      };

    $("branchForm")
      .addEventListener(
        "submit",
        saveBranch
      );

    $("newBenchButton")
      .onclick =
      () => {

        populateBranchSelects();

        modal(
          "benchModal"
        );
      };

    $("benchForm")
      .addEventListener(
        "submit",
        saveBench
      );

    $("newUserButton")
      .onclick =
      () => {

        populateBranchSelects();

        $("userName").value = "";
        $("userUsername").value = "";
        $("userPassword").value = "";
        $("userRole").value = "CASHIER";

        modal(
          "userModal"
        );
      };

    $("userForm")
      .addEventListener(
        "submit",
        createUser
      );

    $("settingsForm")
      .addEventListener(
        "submit",
        saveSettings
      );

    document
      .querySelectorAll(
        "[data-close]"
      )
      .forEach(
        button =>
          button.onclick =
            () =>
              modal(
                button.dataset.close,
                false
              )
      );
  }

  async function bootAdmin() {

    $("adminLogin")
      .classList.add(
        "hidden"
      );

    $("adminApp")
      .classList.remove(
        "hidden"
      );

    $("adminUser")
      .textContent =
      `${state.user.name} · ${state.user.role}`;

    await loadBranches();
    await loadMenu();
    await loadBenches();
    await loadUsers();
  }

  bind();

  (async () => {

    try {

      await getMe();
      await bootAdmin();

    } catch {

      $("adminLogin")
        .classList.remove(
          "hidden"
        );

    }

  })();

})();