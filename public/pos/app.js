(() => {
"use strict";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const money = v => `₹${Number(v || 0).toFixed(2)}`;
const initials = v => String(v || "SG").trim().split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase();
const today = () => new Date().toISOString().slice(0,10);

const state = {
  user:null, branches:[], branch:null, menu:[], benches:[], cart:new Map(),
  held:[], orders:[], printers:[], users:[], activeView:"billing",
  category:"ALL", search:"", orderFilter:"ALL", qrFilter:"ALL",
  orderTimer:null, menuTimer:null, billBusy:false, location:{type:"COUNTER",benchId:null,label:"Counter"}
};

async function api(url, options={}) {
  const r=await fetch(url,{credentials:"include",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  let d=null; try{d=await r.json();}catch{}
  if(!r.ok){const e=new Error(d?.error||`Request failed (${r.status})`);e.status=r.status;throw e;}
  return d;
}
function toast(msg,type="ok"){const t=$("toast");t.textContent=msg;t.className=`toast ${type}`;clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.add("hidden"),2400);}
function openModal(html){$("modalRoot").innerHTML=`<div class="modal-backdrop" data-close-modal><div class="modal-card" role="dialog">${html}</div></div>`;}
function closeModal(){$("modalRoot").innerHTML="";}
function requireBranch(){if(!state.branch)throw new Error("Select a branch first");return state.branch.id;}
function isAdmin(){return ["SUPER_ADMIN","ADMIN"].includes(state.user?.role);}
function branchQuery(){return encodeURIComponent(requireBranch());}

async function getSession(){
  try{
    const d=await api("/api/auth/me");
    if(!d || !d.ok || !d.user){
      return false;
    }
    state.user=d.user;
    return true;
  }catch(e){
    return false;
  }
}

async function login(){
  const b=$("loginButton");
  const error=$("loginError");

  b.disabled=true;
  b.textContent="Signing in…";
  error.textContent="";
  error.classList.add("hidden");

  try{
    const username=$("username").value.trim();
    const password=$("password").value;

    if(!username || !password){
      throw new Error("Enter username and password.");
    }

    const d=await api("/api/auth/login",{
      method:"POST",
      body:JSON.stringify({
        username,
        password
      })
    });

    if(!d || !d.ok || !d.user){
      throw new Error("Login failed. Please check your username and password.");
    }

    state.user=d.user;

    await bootApp();

  }catch(e){
    error.textContent=e?.message || "Unable to sign in. Please try again.";
    error.classList.remove("hidden");
  }finally{
    b.disabled=false;
    b.textContent="Sign in";
  }
}

async function logout(){try{await api("/api/auth/logout",{method:"POST",body:"{}"});}catch{};location.reload();}

async function loadBranches(){
  const data=await api("/api/branches");
  state.branches=Array.isArray(data)?data.filter(x=>x.active!==false):[];
  if(!state.branches.length)throw new Error("No active branch available.");
  const saved=localStorage.getItem("sgar.branch");
  let b=state.branches.find(x=>x.id===saved);
  if(!b && state.user.branchId)b=state.branches.find(x=>x.id===state.user.branchId);
  if(!b)b=state.branches[0];
  state.branch=b;
  renderBranchSwitcher();
}
function renderBranchSwitcher(){
  const s=$("branchSwitcher");
  s.innerHTML=state.branches.map(b=>`<option value="${esc(b.id)}">${esc(b.name)} · ${esc(b.code||"")}</option>`).join("");
  s.value=state.branch?.id||"";
  const can=isAdmin() && state.branches.length>1;
  s.disabled=!can;s.title=can?"Switch active branch":"Branch is assigned to this user";
  $("mobileBranch").textContent=state.branch?.name||"POS";
}
async function switchBranch(id){
  const b=state.branches.find(x=>x.id===id);if(!b)return;
  if(!isAdmin()){toast("This account is locked to its assigned branch","error");renderBranchSwitcher();return;}
  state.branch=b;localStorage.setItem("sgar.branch",b.id);state.cart.clear();state.location={type:"COUNTER",benchId:null,label:"Counter"};
  renderBranchSwitcher();await loadBranchData();renderView();toast(`Switched to ${b.name}`);
}
async function loadBranchData(){
  await Promise.all([loadMenu(),loadBenches(),loadHeld(),loadOrders(true)]);
  if(isAdmin())await Promise.all([loadUsers(),loadPrinters()]);
}
async function loadMenu(){
  const d=await api(`/api/menu?branchId=${branchQuery()}`);state.menu=Array.isArray(d)?d:[];
}
async function loadBenches(){
  try{const d=await api(`/api/benches?branchId=${branchQuery()}`);state.benches=Array.isArray(d)?d:[];}catch{state.benches=[];}
}
async function loadHeld(){try{const d=await api(`/api/held-bills?branchId=${branchQuery()}`);state.held=Array.isArray(d)?d:[];}catch{state.held=[];}}
async function loadOrders(silent=false){
  try{const d=await api(`/api/pos/orders?branchId=${branchQuery()}`);state.orders=Array.isArray(d)?d:[];if(!silent&&["orders","qr-orders","kds"].includes(state.activeView))renderView();}catch(e){if(!silent)toast(e.message,"error");}
}
async function loadUsers(){try{const d=await api(`/api/users?branchId=${branchQuery()}`);state.users=Array.isArray(d)?d:[];}catch{state.users=[];}}
async function loadPrinters(){try{const d=await api(`/api/printers?branchId=${branchQuery()}`);state.printers=Array.isArray(d)?d:[];}catch{state.printers=[];}}

function navItems(){
  const items=[
    ["billing","▣","Billing","F1"],["orders","◫","Orders",""],["qr-orders","⌁","QR Orders",""],["kds","♨","Kitchen / KDS",""],["sales","₹","Sales",""],["reports","▤","Reports",""],["menu","☷","Menu",""],["qr","⌂","QR Locations",""],["admin","⚙","Admin & Settings",""],["held","◷","Held Bills",""]
  ];
  return items;
}
function renderNav(){
  $("mainNav").innerHTML=navItems().map(([id,icon,label,key])=>`<button class="nav-item ${state.activeView===id?"active":""}" data-view="${id}"><span class="nav-icon">${icon}</span><span>${label}</span>${key?`<kbd>${key}</kbd>`:""}${id==="orders"&&state.orders.length?`<i>${state.orders.length}</i>`:""}${id==="qr-orders"&&state.orders.filter(o=>o.source==="QR"&&o.status!=="COMPLETED"&&o.status!=="CANCELLED").length?`<i>${state.orders.filter(o=>o.source==="QR"&&o.status!=="COMPLETED"&&o.status!=="CANCELLED").length}</i>`:""}${id==="held"&&state.held.length?`<i>${state.held.length}</i>`:""}</button>`).join("");
  $("mainNav").querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));
}
function showView(v){state.activeView=v;renderNav();renderView();if(innerWidth<900)document.body.classList.remove("nav-open");}
function setHead(ey,title,sub){$("viewEyebrow").textContent=ey;$("viewTitle").textContent=title;$("viewSubtitle").textContent=sub;}
function renderView(){
  const meta={
    billing:["BILLING","New Bill","Fast counter billing"],
    orders:["OPERATIONS","Orders","Every POS and QR order for this branch"],
    "qr-orders":["DIGITAL ORDERS","QR Orders","Customer orders from QR locations"],
    kds:["KITCHEN","Kitchen Display","Live kitchen workflow"],
    sales:["CASHIER","Sales","Branch sales and payment totals"],
    reports:["ANALYTICS","Reports","Real database sales"],
    menu:["CATALOG","Menu","Live menu configured for the active branch"],
    qr:["QR / SEATING","QR Locations","Bench QR codes and customer ordering"],
    admin:["CONTROL CENTER","Administration","Everything managed inside this application"],
    held:["WORK IN PROGRESS","Held Bills","Resume or discard saved bills"]
  }[state.activeView];
  setHead(...meta);
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${state.activeView}`));
  const fn={billing:renderBilling,orders:renderOrders,"qr-orders":renderQROrders,kds:renderKds,sales:renderSales,reports:renderReports,menu:renderAdminMenu,qr:renderQR,admin:renderAdmin,held:renderHeld}[state.activeView];
  if(fn)fn();
}

function locationSelector(){
  const benchCount=state.benches.length;
  const selected=state.location.type==="BENCH"?state.location.label:state.location.type==="CUSTOM"?state.location.label:"Counter";
  return `<div class="location-picker">
    <div class="location-summary"><span class="eyebrow">ORDER LOCATION</span><strong>${esc(selected)}</strong></div>
    <div class="location-buttons">
      <button class="${state.location.type==="COUNTER"?"selected":""}" data-loc="COUNTER"><b>C</b><span>Counter<small>Takeaway</small></span></button>
      <button class="${state.location.type==="BENCH"?"selected":""}" data-loc="BENCH"><b>${state.location.type==="BENCH"?esc(state.location.label.replace(/\D/g,"")):"B"}</b><span>Bench<small>${benchCount} available</small></span></button>
      <button class="${state.location.type==="CUSTOM"?"selected":""}" data-loc="CUSTOM"><b>+</b><span>Custom<small>Other location</small></span></button>
    </div>
    ${state.location.type==="CUSTOM"?`<input id="customLoc" class="input" value="${esc(state.location.label==="Custom"?"":state.location.label)}" placeholder="Location name">`:""}
  </div>`;
}
function renderBilling(){
  const cats=["ALL",...new Set(state.menu.map(x=>x.category).filter(Boolean))];
  const filtered=state.menu.filter(x=>(state.category==="ALL"||x.category===state.category)&&(!state.search||`${x.name} ${x.category} ${x.barcode||""}`.toLowerCase().includes(state.search)));
  const lines=[...state.cart.values()].map(l=>{const m=state.menu.find(x=>x.id===l.menuItemId);return m?{...l,item:m}:null}).filter(Boolean);
  const sub=lines.reduce((s,l)=>s+Number(l.item.price)*l.quantity,0);
  const discount=Math.min(Math.max(Number(state.discount||0),0),sub);
  const tax=state.branch?.taxEnabled?Math.max(0,(sub-discount)*Number(state.branch.taxRate||0)/100):0;
  const total=Math.max(0,sub-discount+tax);
  $("view-billing").innerHTML=`<div class="billing-grid">
    <div class="catalog-panel">
      <div class="catalog-toolbar"><div><b>${state.menu.length} items</b><span>Tap an item to add</span></div><label class="search"><span>⌕</span><input id="menuSearch" value="${esc(state.search)}" placeholder="Search menu…"></label></div>
      <div class="chips">${cats.map(c=>`<button class="${state.category===c?"active":""}" data-cat="${esc(c)}">${c==="ALL"?"All":esc(c)}</button>`).join("")}</div>
      <div class="menu-grid">${filtered.map(item=>`<button class="product ${item.soldOut?"sold":""}" data-add="${esc(item.id)}" ${item.soldOut?"disabled":""}>
        <div class="product-top"><span class="product-mark">${esc(initials(item.name))}</span>${item.soldOut?'<em>SOLD OUT</em>':'<em>AVAILABLE</em>'}</div>
        <div class="product-cat">${esc(item.category||"Menu")}</div><strong>${esc(item.name)}</strong><p>${esc(item.description||"")}</p>
        <div class="product-bottom"><b>${money(item.price)}</b><span>+</span></div>
      </button>`).join("")}</div>
    </div>
    <aside class="bill-card">
      <div class="bill-top"><div><span class="eyebrow">CURRENT BILL</span><h2>New bill</h2></div><button id="clearBill" class="ghost danger">Clear</button></div>
      ${locationSelector()}
      <div class="customer-grid"><input id="customerName" class="input" placeholder="Customer name"><input id="customerPhone" class="input" inputmode="tel" placeholder="Phone"></div>
      <div class="bill-lines">${lines.length?lines.map(l=>`<div class="bill-line"><div><strong>${esc(l.item.name)}</strong><small>${money(l.item.price)} each</small></div><div class="qty"><button data-qty="${esc(l.item.id)}" data-delta="-1">−</button><b>${l.quantity}</b><button data-qty="${esc(l.item.id)}" data-delta="1">+</button></div><strong>${money(Number(l.item.price)*l.quantity)}</strong></div>`).join(""):`<div class="empty-bill"><span>＋</span><b>Start a new bill</b><small>Select items from the menu</small></div>`}</div>
      <div class="summary"><div><span>Subtotal</span><b>${money(sub)}</b></div><div><span>Discount</span><input id="discount" class="mini-input" type="number" min="0" step="0.01" value="${discount||0}"></div><div><span>Tax</span><b>${money(tax)}</b></div><div class="grand"><span>Total</span><strong>${money(total)}</strong></div></div>
      <div class="bill-actions"><button id="holdBill" class="btn btn-light" ${!lines.length?"disabled":""}>Hold Bill</button><button id="completeBill" class="btn btn-dark btn-large" ${!lines.length?"disabled":""}>Complete Bill <span>→</span></button></div>
    </aside>
  </div>`;
  bindBilling();
}
function bindBilling(){
  $("menuSearch").oninput=e=>{state.search=e.target.value.toLowerCase();renderBilling();};
  document.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>{state.category=b.dataset.cat;renderBilling();});
  document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>addCart(b.dataset.add));
  document.querySelectorAll("[data-qty]").forEach(b=>b.onclick=()=>changeQty(b.dataset.qty,Number(b.dataset.delta)));
  $("discount").oninput=e=>{state.discount=Number(e.target.value)||0;renderBilling();};
  $("clearBill").onclick=()=>{if(state.cart.size&&!confirm("Clear this bill?"))return;state.cart.clear();state.discount=0;renderBilling();};
  document.querySelectorAll("[data-loc]").forEach(b=>b.onclick=()=>chooseLocation(b.dataset.loc));
  $("customLoc")?.addEventListener("input",e=>{state.location.label=e.target.value||"Custom";});
  $("holdBill").onclick=holdBill;
  $("completeBill").onclick=completeBill;
}
function chooseLocation(type){
  if(type==="COUNTER"){state.location={type,benchId:null,label:"Counter"};renderBilling();return;}
  if(type==="CUSTOM"){state.location={type,benchId:null,label:"Custom"};renderBilling();return;}
  openBenchPicker();
}
function openBenchPicker(){
  const active=new Set(state.benches.filter(b=>b.active!==false).map(b=>b.id));
  openModal(`<div class="modal-head"><div><span class="eyebrow">ORDER LOCATION</span><h2>Select Bench</h2></div><button class="icon-btn" data-close-modal>×</button></div><input id="benchSearch" class="input" placeholder="Search bench 1–100…"><div class="bench-grid" id="benchGrid">${state.benches.filter(b=>active.has(b.id)).sort((a,b)=>String(a.label).localeCompare(String(b.label),undefined,{numeric:true})).map(b=>`<button data-pick-bench="${esc(b.id)}" class="${state.location.benchId===b.id?"selected":""}"><b>${esc(String(b.label).replace(/\D/g,"")||b.label)}</b><span>${esc(b.label)}</span></button>`).join("")}</div>`);
  $("benchSearch").oninput=e=>{const q=e.target.value.toLowerCase();$("benchGrid").querySelectorAll("[data-pick-bench]").forEach(b=>b.classList.toggle("hidden",!b.textContent.toLowerCase().includes(q)));};
  $("benchGrid").querySelectorAll("[data-pick-bench]").forEach(b=>b.onclick=()=>{const x=state.benches.find(v=>v.id===b.dataset.pickBench);state.location={type:"BENCH",benchId:x.id,label:x.label};closeModal();renderBilling();});
}
function addCart(id){const m=state.menu.find(x=>x.id===id);if(!m||m.soldOut)return;const l=state.cart.get(id);if(l)l.quantity++;else state.cart.set(id,{menuItemId:id,quantity:1});renderBilling();}
function changeQty(id,d){const l=state.cart.get(id);if(!l)return;l.quantity+=d;if(l.quantity<=0)state.cart.delete(id);renderBilling();}
function cartLines(){return [...state.cart.values()].map(l=>{const m=state.menu.find(x=>x.id===l.menuItemId);return m?{menuItemId:m.id,quantity:l.quantity}:null}).filter(Boolean);}
async function completeBill(){
  if(state.billBusy||!state.cart.size)return;
  const location=state.location.type==="BENCH"?state.location:state.location.type==="CUSTOM"?{benchId:null,label:state.location.label}:{benchId:null,label:"Counter"};
  const customerName=$("customerName")?.value.trim()||undefined, customerPhone=$("customerPhone")?.value.trim()||undefined;
  const discount=Number($("discount")?.value||0);
  const payment=await paymentModal();if(!payment)return;
  state.billBusy=true;
  try{
    const d=await api("/api/pos/orders",{method:"POST",body:JSON.stringify({branchId:requireBranch(),benchId:location.benchId||null,customerName,customerPhone,discount,paymentMethod:payment,lines:cartLines(),clientRequestId:crypto.randomUUID()})});
    state.cart.clear();state.discount=0;state.location={type:"COUNTER",benchId:null,label:"Counter"};await loadOrders(true);await loadSalesCache();showReceipt(d.order);
  }catch(e){toast(e.message,"error");}
  finally{state.billBusy=false;}
}
function paymentModal(){
  const b=state.branch;
  return new Promise(resolve=>{
    openModal(`<div class="modal-head"><div><span class="eyebrow">PAYMENT</span><h2>Complete Bill</h2></div><button class="icon-btn" data-close-modal>×</button></div><div class="pay-grid">${b.paymentCashEnabled!==false?'<button data-pay="CASH"><b>₹</b><span>Cash</span><small>Cash payment</small></button>':""}${b.paymentUpiEnabled!==false?'<button data-pay="UPI"><b>⌁</b><span>UPI</span><small>UPI / QR</small></button>':""}${b.paymentCardEnabled!==false?'<button data-pay="CARD"><b>▣</b><span>Card</span><small>Debit / credit</small></button>':""}</div>`);
    document.querySelectorAll("[data-pay]").forEach(x=>x.onclick=()=>{closeModal();resolve(x.dataset.pay);});
    document.querySelector("[data-close-modal]")?.addEventListener("click",()=>{closeModal();resolve(null);});
  });
}
function showReceipt(order){
  openModal(`<div class="modal-head"><div><span class="eyebrow">BILL COMPLETE</span><h2>${esc(order.invoiceNumber||`#${order.number}`)}</h2><p class="muted">Payment: ${esc(order.paymentMethod||"")}</p></div><button class="icon-btn" data-close-modal>×</button></div><div class="success-box"><span>✓</span><div><b>Payment recorded</b><small>${money(order.total)} · ${esc(state.branch.name)}</small></div></div><div class="receipt-preview"><img src="/brand/logo-primary.jpg"><strong>${esc(state.branch.name)}</strong><span>${esc(state.branch.address||"")}</span><span>Bill ${esc(order.invoiceNumber||order.number)}</span><hr>${(order.lines||[]).map(l=>`<div><span>${esc(l.menuItem?.name||"Item")} × ${l.quantity}</span><b>${money(l.lineTotal)}</b></div>`).join("")}<hr><div><b>Total</b><strong>${money(order.total)}</strong></div></div><div class="modal-actions"><button class="btn btn-light" data-close-modal>New Bill</button><button id="openPdf" class="btn btn-dark">Open / Print PDF</button></div>`);
  $("openPdf").onclick=()=>window.open(`/api/orders/${encodeURIComponent(order.id)}/pdf`,"_blank","noopener");
}
async function holdBill(){
  if(!state.cart.size)return;
  try{
    await api("/api/held-bills",{method:"POST",body:JSON.stringify({branchId:requireBranch(),benchId:state.location.benchId||null,payload:{customerName:$("customerName")?.value||"",customerPhone:$("customerPhone")?.value||"",discount:Number($("discount")?.value||0),location:state.location,lines:cartLines()}})});
    state.cart.clear();state.discount=0;state.location={type:"COUNTER",benchId:null,label:"Counter"};await loadHeld();renderBilling();renderNav();toast("Bill held");
  }catch(e){toast(e.message,"error");}
}
function renderHeld(){
  $("view-held").innerHTML=`<div class="page-card"><div class="section-head"><div><h2>Held Bills</h2><p>Saved bills for this branch.</p></div><button class="btn btn-light" id="refreshHeld">Refresh</button></div>${state.held.length?`<div class="table-list">${state.held.map(h=>`<article><div><b>${esc(h.customerName||"Unnamed customer")}</b><span>${new Date(h.createdAt).toLocaleString("en-IN")}</span></div><div><button class="btn btn-light" data-resume="${h.id}">Resume</button><button class="btn btn-danger" data-delete-held="${h.id}">Discard</button></div></article>`).join("")}</div>`:`<div class="empty-page"><span>◷</span><b>No held bills</b><small>Held bills will appear here.</small></div>`}</div>`;
  $("refreshHeld").onclick=async()=>{await loadHeld();renderHeld();renderNav();};
  document.querySelectorAll("[data-delete-held]").forEach(b=>b.onclick=async()=>{if(!confirm("Discard this held bill?"))return;await api(`/api/held-bills/${b.dataset.deleteHeld}`,{method:"DELETE"});await loadHeld();renderHeld();renderNav();});
  document.querySelectorAll("[data-resume]").forEach(b=>b.onclick=async()=>{const h=state.held.find(x=>x.id===b.dataset.resume);if(!h)return;const p=typeof h.payload==="string"?JSON.parse(h.payload):h.payload;state.cart=new Map((p.lines||[]).map(x=>[x.menuItemId,{menuItemId:x.menuItemId,quantity:x.quantity}]));state.discount=Number(p.discount||0);state.location=p.location||{type:"COUNTER",benchId:null,label:"Counter"};await api(`/api/held-bills/${h.id}`,{method:"DELETE"}).catch(()=>{});await loadHeld();showView("billing");});
}
function orderCard(o,actions=true){
  const qr=o.source==="QR", status=o.status;
  const next={PENDING:"ACCEPTED",ACCEPTED:"PREPARING",PREPARING:"READY",READY:"SERVED",SERVED:"COMPLETED"}[status];
  return `<article class="order-card"><div class="order-main"><div class="order-id">#${esc(o.invoiceNumber||o.number)} <span class="status ${status.toLowerCase()}">${status}</span></div><div class="order-meta">${qr?"QR":"POS"} · ${esc(o.bench?.label||"Counter")} · ${esc(o.paymentMethod||"UNPAID")} · ${new Date(o.createdAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</div><div class="order-items">${(o.lines||[]).map(l=>`<span>${esc(l.menuItem?.name||"Item")} × ${l.quantity}</span>`).join("")}</div></div><div class="order-side"><strong>${money(o.total)}</strong>${actions&&next?`<button class="btn btn-light" data-status="${o.id}" data-next="${next}">${next}</button>`:""}</div></article>`;
}
async function updateStatus(id,status){try{await api(`/api/orders/${id}/status`,{method:"PATCH",body:JSON.stringify({status})});await loadOrders(true);renderView();}catch(e){toast(e.message,"error");}}
function bindStatus(){document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>updateStatus(b.dataset.status,b.dataset.next));}
function renderOrders(){
  const f=state.orderFilter==="ALL"?state.orders:state.orders.filter(o=>o.status===state.orderFilter);
  $("view-orders").innerHTML=`<div class="page-card"><div class="section-head"><div><h2>Orders</h2><p>${state.orders.length} branch orders</p></div><button class="btn btn-light" id="refreshOrders">Refresh</button></div><div class="filter-row">${["ALL","PENDING","ACCEPTED","PREPARING","READY","SERVED","COMPLETED","CANCELLED"].map(x=>`<button class="${state.orderFilter===x?"active":""}" data-order-filter="${x}">${x}</button>`).join("")}</div><div class="order-list">${f.map(o=>orderCard(o)).join("")||'<div class="empty-page"><span>◫</span><b>No orders</b></div>'}</div></div>`;
  $("refreshOrders").onclick=async()=>{await loadOrders();renderOrders();};
  document.querySelectorAll("[data-order-filter]").forEach(b=>b.onclick=()=>{state.orderFilter=b.dataset.orderFilter;renderOrders();});
  bindStatus();
}
function renderQROrders(){
  const all=state.orders.filter(o=>o.source==="QR"), f=state.qrFilter==="ALL"?all:all.filter(o=>o.status===state.qrFilter);
  $("view-qr-orders").innerHTML=`<div class="page-card"><div class="section-head"><div><h2>QR Orders</h2><p>Customer orders from bench QR codes.</p></div><button class="btn btn-light" id="refreshQr">Refresh</button></div><div class="filter-row">${["ALL","PENDING","ACCEPTED","PREPARING","READY","SERVED","COMPLETED","CANCELLED"].map(x=>`<button class="${state.qrFilter===x?"active":""}" data-qr-filter="${x}">${x}</button>`).join("")}</div><div class="order-list">${f.map(o=>orderCard(o)).join("")||'<div class="empty-page"><span>⌁</span><b>No QR orders</b></div>'}</div></div>`;
  $("refreshQr").onclick=async()=>{await loadOrders();renderQROrders();};document.querySelectorAll("[data-qr-filter]").forEach(b=>b.onclick=()=>{state.qrFilter=b.dataset.qrFilter;renderQROrders();});bindStatus();
}
function renderKds(){
  const active=state.orders.filter(o=>["PENDING","ACCEPTED","PREPARING","READY","SERVED"].includes(o.status));
  const columns=["PENDING","ACCEPTED","PREPARING","READY","SERVED"];
  $("view-kds").innerHTML=`<div class="kds-grid">${columns.map(s=>`<section class="kds-col"><header><b>${s}</b><span>${active.filter(o=>o.status===s).length}</span></header>${active.filter(o=>o.status===s).map(o=>`<article class="kds-card"><div><strong>#${esc(o.invoiceNumber||o.number)}</strong><span>${esc(o.bench?.label||"Counter")}</span></div><time>${new Date(o.createdAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</time><ul>${(o.lines||[]).map(l=>`<li>${l.quantity} × ${esc(l.menuItem?.name||"Item")}</li>`).join("")}</ul>${({PENDING:"ACCEPTED",ACCEPTED:"PREPARING",PREPARING:"READY",READY:"SERVED",SERVED:"COMPLETED"})[s]?`<button class="btn btn-dark full" data-status="${o.id}" data-next="${({PENDING:"ACCEPTED",ACCEPTED:"PREPARING",PREPARING:"READY",READY:"SERVED",SERVED:"COMPLETED"})[s]}">Move to ${({PENDING:"ACCEPTED",ACCEPTED:"PREPARING",PREPARING:"READY",READY:"SERVED",SERVED:"COMPLETED"})[s]}</button>`:""}</article>`).join("")}</section>`).join("")}</div>`;
  bindStatus();
}
let salesCache=null;
async function loadSalesCache(){try{salesCache=await api(`/api/reports/daily-sales?branchId=${branchQuery()}&date=${today()}`);}catch{}}
function renderSales(){
  const d=salesCache||{totalSales:0,orders:0,cash:0,upi:0,card:0,qrOrders:0,pending:0,items:[]};
  $("view-sales").innerHTML=`<div class="metric-grid"><div class="metric primary"><span>Today's Sales</span><strong>${money(d.totalSales)}</strong><small>${d.orders||0} orders</small></div><div class="metric"><span>Cash</span><strong>${money(d.cash)}</strong></div><div class="metric"><span>UPI</span><strong>${money(d.upi)}</strong></div><div class="metric"><span>Card</span><strong>${money(d.card)}</strong></div><div class="metric"><span>QR Orders</span><strong>${d.qrOrders||0}</strong></div></div><div class="page-card"><div class="section-head"><div><h2>Items sold today</h2><p>Real database totals.</p></div><button class="btn btn-light" id="refreshSales">Refresh</button></div><div class="item-sales">${(d.items||[]).map(i=>`<div><span>${esc(i.name)}</span><b>${i.quantity}</b></div>`).join("")||'<div class="empty-page"><span>₹</span><b>No sales yet</b></div>'}</div></div>`;
  $("refreshSales").onclick=async()=>{await loadSalesCache();renderSales();};
}
async function renderReports(){
  const d=salesCache||{totalSales:0,orders:0,cash:0,upi:0,card:0,items:[]};
  $("view-reports").innerHTML=`<div class="report-toolbar"><input id="reportDate" class="input" type="date" value="${today()}"><button id="runReport" class="btn btn-dark">Run Report</button></div><div id="reportBody"></div>`;
  async function run(){const date=$("reportDate").value;try{const x=await api(`/api/reports/daily-sales?branchId=${branchQuery()}&date=${encodeURIComponent(date)}`);$("reportBody").innerHTML=`<div class="metric-grid"><div class="metric primary"><span>Total Sales</span><strong>${money(x.totalSales)}</strong><small>${x.orders} orders</small></div><div class="metric"><span>Cash</span><strong>${money(x.cash)}</strong></div><div class="metric"><span>UPI</span><strong>${money(x.upi)}</strong></div><div class="metric"><span>Card</span><strong>${money(x.card)}</strong></div></div><div class="page-card"><h2>Items</h2><div class="item-sales">${(x.items||[]).map(i=>`<div><span>${esc(i.name)}</span><b>${i.quantity}</b></div>`).join("")||"<p class='muted'>No items.</p>"}</div></div>`}catch(e){$("reportBody").innerHTML=`<div class="error">${esc(e.message)}</div>`}}$("runReport").onclick=run;run();
}
function renderAdminMenu(){
  $("view-menu").innerHTML=`<div class="page-card"><div class="section-head"><div><h2>Menu</h2><p>Branch: ${esc(state.branch.name)}</p></div>${isAdmin()?'<button id="newMenu" class="btn btn-dark">+ Add Item</button>':""}</div><div class="admin-list">${state.menu.map(m=>`<article><div class="avatar">${esc(initials(m.name))}</div><div class="grow"><b>${esc(m.name)}</b><span>${esc(m.category)} · ${money(m.price)}</span></div><span class="status ${m.soldOut?"cancelled":"completed"}">${m.soldOut?"SOLD OUT":"AVAILABLE"}</span>${isAdmin()?`<button class="btn btn-light" data-edit-menu="${m.id}">Edit</button><button class="btn btn-danger" data-delete-menu="${m.id}">Delete</button>`:""}</article>`).join("")}</div></div>`;
  $("newMenu")?.addEventListener("click",()=>menuModal());
  document.querySelectorAll("[data-edit-menu]").forEach(b=>b.onclick=()=>menuModal(state.menu.find(m=>m.id===b.dataset.editMenu)));
  document.querySelectorAll("[data-delete-menu]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete/archive this menu item?"))return;try{await api(`/api/menu/${b.dataset.deleteMenu}`,{method:"DELETE"});await loadMenu();renderAdminMenu();renderBilling();toast("Menu updated");}catch(e){toast(e.message,"error");}});
}
function menuModal(item=null){
  openModal(`<div class="modal-head"><div><span class="eyebrow">MENU</span><h2>${item?"Edit item":"Add menu item"}</h2></div><button class="icon-btn" data-close-modal>×</button></div><form id="entityForm" class="form-grid"><label>Name<input name="name" required value="${esc(item?.name||"")}"></label><label>Category<input name="category" required value="${esc(item?.category||"")}"></label><label>Price<input name="price" type="number" step="0.01" min="0" required value="${esc(item?.price||"")}"></label><label>Barcode<input name="barcode" value="${esc(item?.barcode||"")}"></label><label class="wide">Description<textarea name="description">${esc(item?.description||"")}</textarea></label><label class="check"><input name="soldOut" type="checkbox" ${item?.soldOut?"checked":""}> Sold out</label><div class="modal-actions wide"><button type="button" class="btn btn-light" data-close-modal>Cancel</button><button class="btn btn-dark">${item?"Save changes":"Create item"}</button></div></form>`);
  $("entityForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const body={name:f.get("name"),category:f.get("category"),price:Number(f.get("price")),barcode:f.get("barcode")||undefined,description:f.get("description")||undefined,soldOut:f.has("soldOut")};try{await api(item?`/api/menu/${item.id}`:"/api/menu",{method:item?"PATCH":"POST",body:JSON.stringify({...body,branchId:state.branch.id})});closeModal();await loadMenu();renderAdminMenu();toast(item?"Menu updated":"Menu created");}catch(x){toast(x.message,"error");}};
}
async function renderQR(){
  const bs=state.benches.slice().sort((a,b)=>String(a.label).localeCompare(String(b.label),undefined,{numeric:true}));
  $("view-qr").innerHTML=`<div class="page-card"><div class="section-head"><div><h2>QR Locations</h2><p>${bs.length} benches · ${esc(state.branch.name)}</p></div>${isAdmin()?'<button id="generate100" class="btn btn-dark">Generate missing 1–100</button>':""}</div><div class="qr-tools"><input id="qrSearch" class="input" placeholder="Search bench…"><span class="muted">Counter billing does not need a QR.</span></div><div id="qrGrid" class="qr-grid">${bs.map(b=>qrCard(b)).join("")}</div></div>`;
  $("qrSearch").oninput=e=>{const q=e.target.value.toLowerCase();document.querySelectorAll("[data-qr-card]").forEach(c=>c.classList.toggle("hidden",!c.textContent.toLowerCase().includes(q)));};
  $("generate100")?.addEventListener("click",generate100);
  document.querySelectorAll("[data-qr-open]").forEach(b=>b.onclick=()=>window.open(b.dataset.qrOpen,"_blank","noopener"));
  document.querySelectorAll("[data-qr-copy]").forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(b.dataset.qrCopy);toast("QR link copied");});
  document.querySelectorAll("[data-qr-print]").forEach(b=>b.onclick=()=>printQr(b.dataset.qrPrint,b.dataset.label));
  document.querySelectorAll("[data-bench-toggle]").forEach(b=>b.onclick=async()=>{try{await api(`/api/benches/${b.dataset.benchToggle}`,{method:"PATCH",body:JSON.stringify({active:b.dataset.active!=="true"})});await loadBenches();renderQR();}catch(e){toast(e.message,"error");}});
}
function qrCard(b){const url=`${location.origin}/order/${encodeURIComponent(b.token)}`;return `<article class="qr-card" data-qr-card><div class="qr-image"><img loading="lazy" src="/api/qr/${encodeURIComponent(b.token)}.png" alt="QR ${esc(b.label)}"></div><div class="qr-info"><b>${esc(b.label)}</b><span class="status ${b.active?"completed":"cancelled"}">${b.active?"ACTIVE":"DISABLED"}</span><small>Customer QR ordering</small><div class="qr-actions"><button class="btn btn-light" data-qr-open="${esc(url)}">Open</button><button class="btn btn-light" data-qr-copy="${esc(url)}">Copy</button><button class="btn btn-light" data-qr-print="${esc(url)}" data-label="${esc(b.label)}">Print</button>${isAdmin()?`<button class="btn btn-light" data-bench-toggle="${b.id}" data-active="${b.active}">${b.active?"Disable":"Enable"}</button>`:""}</div></div></article>`}
async function generate100(){
  const existing=new Set(state.benches.map(b=>String(b.label).trim().toLowerCase()));
  const missing=Array.from({length:100},(_,i)=>`Bench ${i+1}`).filter(x=>!existing.has(x.toLowerCase()));
  if(!missing.length){toast("Bench 1–100 already exist");return;}
  const button=$("generate100");button.disabled=true;button.textContent=`Creating ${missing.length}…`;
  try{for(const label of missing)await api("/api/benches",{method:"POST",body:JSON.stringify({branchId:state.branch.id,label})});await loadBenches();renderQR();toast(`Created ${missing.length} bench QR locations`);}catch(e){toast(e.message,"error");}finally{button.disabled=false;}
}
function printQr(url,label){
  const w=window.open("","_blank","noopener");if(!w)return;
  w.document.write(`<html><head><title>${esc(label)} QR</title><style>body{font-family:Arial;text-align:center;padding:30px}img{width:280px}h1{font-size:24px}</style></head><body><h1>${esc(state.branch.name)}</h1><h2>${esc(label)}</h2><img src="${esc(new URL(url).origin)}/api/qr/${encodeURIComponent(state.benches.find(b=>b.label===label)?.token||"")}.png"><p>Scan to order</p><script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);w.document.close();
}
async function renderAdmin(){
  if(!isAdmin()){$("view-admin").innerHTML=`<div class="empty-page"><span>⚙</span><b>Administrator access required</b></div>`;return;}
  const tabs=[["branches","Branches"],["users","Users"],["settings","Settings"],["printers","Printers"]];
  $("view-admin").innerHTML=`<div class="admin-shell"><div class="admin-tabs">${tabs.map(([id,l])=>`<button class="${(state.adminTab||"branches")===id?"active":""}" data-admin-tab="${id}">${l}</button>`).join("")}</div><div id="adminPanel"></div></div>`;
  document.querySelectorAll("[data-admin-tab]").forEach(b=>b.onclick=()=>{state.adminTab=b.dataset.adminTab;renderAdmin();});
  renderAdminPanel();
}
function renderAdminPanel(){
  const p=$("adminPanel"),t=state.adminTab||"branches";
  if(t==="branches")return renderBranchesPanel(p);
  if(t==="users")return renderUsersPanel(p);
  if(t==="settings")return renderSettingsPanel(p);
  renderPrintersPanel(p);
}
function renderBranchesPanel(p){
  p.innerHTML=`<div class="section-head"><div><h2>Branches</h2><p>Every branch has isolated menu, orders, QR locations and reports.</p></div><button id="addBranch" class="btn btn-dark">+ New Branch</button></div><div class="admin-list">${state.branches.map(b=>`<article><div class="avatar">${esc(initials(b.name))}</div><div class="grow"><b>${esc(b.name)}</b><span>${esc(b.code||"")} · ${esc(b.address||"No address")}</span></div><span class="status ${b.active?"completed":"cancelled"}">${b.active?"ACTIVE":"DISABLED"}</span><button class="btn btn-light" data-edit-branch="${b.id}">Open / Edit</button></article>`).join("")}</div>`;
  $("addBranch").onclick=()=>branchModal();document.querySelectorAll("[data-edit-branch]").forEach(b=>b.onclick=()=>branchModal(state.branches.find(x=>x.id===b.dataset.editBranch)));
}
function branchModal(b=null){
  openModal(`<div class="modal-head"><div><span class="eyebrow">BRANCH</span><h2>${b?"Branch settings":"Create branch"}</h2></div><button class="icon-btn" data-close-modal>×</button></div><form id="branchForm" class="form-grid"><label>Name<input name="name" required value="${esc(b?.name||"")}"></label><label>Code<input name="code" required value="${esc(b?.code||"")}"></label><label>Slug<input name="slug" required value="${esc(b?.slug||"")}"></label><label>Phone<input name="phone" value="${esc(b?.phone||"")}"></label><label>GSTIN<input name="gstin" value="${esc(b?.gstin||"")}"></label><label>FSSAI<input name="fssai" value="${esc(b?.fssai||"")}"></label><label>Invoice Prefix<input name="invoicePrefix" value="${esc(b?.invoicePrefix||"INV")}"></label><label>Paper<select name="receiptPaperWidth"><option ${b?.receiptPaperWidth==58?"selected":""}>58</option><option ${!b||b?.receiptPaperWidth==80?"selected":""}>80</option></select></label><label class="wide">Address<input name="address" value="${esc(b?.address||"")}"></label><label>UPI ID<input name="upiId" value="${esc(b?.upiId||"")}"></label><label>UPI Name<input name="upiName" value="${esc(b?.upiName||"")}"></label><label class="check"><input name="taxEnabled" type="checkbox" ${b?.taxEnabled?"checked":""}> Tax enabled</label><label>Tax %<input name="taxRate" type="number" step="0.01" value="${esc(b?.taxRate||0)}"></label><label class="wide">Receipt header<input name="receiptHeader" value="${esc(b?.receiptHeader||"")}"></label><label class="wide">Receipt footer<input name="receiptFooter" value="${esc(b?.receiptFooter||"")}"></label><div class="modal-actions wide"><button type="button" class="btn btn-light" data-close-modal>Cancel</button><button class="btn btn-dark">${b?"Save":"Create"}</button></div></form>`);
  $("branchForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const body=Object.fromEntries(f.entries());body.taxEnabled=f.has("taxEnabled");body.taxRate=Number(body.taxRate||0);body.receiptPaperWidth=Number(body.receiptPaperWidth||80);try{await api(b?`/api/branches/${b.id}`:"/api/branches",{method:b?"PATCH":"POST",body:JSON.stringify(body)});closeModal();await loadBranches();await loadBranchData();renderView();toast(b?"Branch saved":"Branch created");}catch(x){toast(x.message,"error");}};
}
async function renderUsersPanel(p){
  await loadUsers();p.innerHTML=`<div class="section-head"><div><h2>Users</h2><p>Cashiers, managers, kitchen and administrators.</p></div><button id="addUser" class="btn btn-dark">+ New User</button></div><div class="admin-list">${state.users.map(u=>`<article><div class="avatar">${esc(initials(u.name))}</div><div class="grow"><b>${esc(u.name)}</b><span>@${esc(u.username)} · ${esc(u.branch?.name||"No branch")}</span></div><span class="role-pill">${esc(u.role)}</span><span class="status ${u.active?"completed":"cancelled"}">${u.active?"ACTIVE":"DISABLED"}</span><button class="btn btn-light" data-edit-user="${u.id}">Edit</button></article>`).join("")}</div>`;$("addUser").onclick=()=>userModal();document.querySelectorAll("[data-edit-user]").forEach(b=>b.onclick=()=>userModal(state.users.find(u=>u.id===b.dataset.editUser)));
}
function userModal(u=null){
  const roles=["ADMIN","MANAGER","CASHIER","KITCHEN"];
  openModal(`<div class="modal-head"><div><span class="eyebrow">USER</span><h2>${u?"Edit user":"Create user"}</h2></div><button class="icon-btn" data-close-modal>×</button></div><form id="userForm" class="form-grid"><label>Name<input name="name" required value="${esc(u?.name||"")}"></label><label>Username<input name="username" required ${u?"disabled":""} value="${esc(u?.username||"")}"></label>${!u?'<label>Password<input name="password" type="password" minlength="8" required></label>':""}<label>Role<select name="role">${roles.map(r=>`<option ${u?.role===r?"selected":""}>${r}</option>`).join("")}</select></label><label>Branch<select name="branchId">${state.branches.map(b=>`<option value="${b.id}" ${u?.branchId===b.id?"selected":""}>${esc(b.name)}</option>`).join("")}</select></label><label class="check"><input name="active" type="checkbox" ${u?.active!==false?"checked":""}> Active</label><div class="modal-actions wide"><button type="button" class="btn btn-light" data-close-modal>Cancel</button><button class="btn btn-dark">Save</button></div></form>`);
  $("userForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const body={name:f.get("name"),role:f.get("role"),branchId:f.get("branchId"),active:f.has("active")};if(!u)body.username=f.get("username"),body.password=f.get("password");try{await api(u?`/api/users/${u.id}`:"/api/users",{method:u?"PATCH":"POST",body:JSON.stringify(body)});closeModal();await loadUsers();renderAdmin();toast("User saved");}catch(x){toast(x.message,"error");}};
}
async function renderPrintersPanel(p){
  await loadPrinters();p.innerHTML=`<div class="section-head"><div><h2>Printers</h2><p>Receipt/KOT printer configuration. Billing never depends on a printer.</p></div><button id="addPrinter" class="btn btn-dark">+ Add Printer</button></div><div class="admin-list">${state.printers.map(x=>`<article><div class="avatar">▣</div><div class="grow"><b>${esc(x.name)}</b><span>${esc(x.type)} · ${esc(x.connection)} · ${x.paperWidth}mm</span></div><span class="status ${x.active?"completed":"cancelled"}">${x.active?"ACTIVE":"DISABLED"}</span><button class="btn btn-light" data-edit-printer="${x.id}">Edit</button></article>`).join("")||'<div class="empty-page"><span>▣</span><b>No printers configured</b></div>'}</div>`;$("addPrinter").onclick=()=>printerModal();document.querySelectorAll("[data-edit-printer]").forEach(b=>b.onclick=()=>printerModal(state.printers.find(x=>x.id===b.dataset.editPrinter)));
}
function printerModal(p=null){
  openModal(`<div class="modal-head"><div><span class="eyebrow">PRINTER</span><h2>${p?"Edit printer":"Add printer"}</h2></div><button class="icon-btn" data-close-modal>×</button></div><form id="printerForm" class="form-grid"><label>Name<input name="name" required value="${esc(p?.name||"Receipt Printer")}"></label><label>Type<select name="type"><option>RECEIPT</option><option>KOT</option><option>LABEL</option></select></label><label>Connection<select name="connection"><option>USB</option><option>NETWORK</option><option>BLUETOOTH</option><option>WIFI</option></select></label><label>Host<input name="host" value="${esc(p?.host||"")}"></label><label>Port<input name="port" type="number" value="${esc(p?.port||"")}"></label><label>Paper<select name="paperWidth"><option ${p?.paperWidth==58?"selected":""}>58</option><option ${!p||p?.paperWidth==80?"selected":""}>80</option></select></label><label class="check"><input name="active" type="checkbox" ${p?.active!==false?"checked":""}> Active</label><div class="modal-actions wide"><button type="button" class="btn btn-light" data-close-modal>Cancel</button><button class="btn btn-dark">Save</button></div></form>`);
  $("printerForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const body={name:f.get("name"),type:f.get("type"),connection:f.get("connection"),host:f.get("host")||null,port:f.get("port")?Number(f.get("port")):null,paperWidth:Number(f.get("paperWidth")),active:f.has("active")};try{await api(p?`/api/printers/${p.id}`:"/api/printers",{method:p?"PATCH":"POST",body:JSON.stringify({...body,branchId:state.branch.id})});closeModal();await loadPrinters();renderAdmin();toast("Printer saved");}catch(x){toast(x.message,"error");}};
}
function renderSettingsPanel(p){
  const b=state.branch;p.innerHTML=`<div class="page-card"><div class="section-head"><div><h2>Receipt & Payment Settings</h2><p>Saved directly to the active branch.</p></div></div><form id="settingsForm" class="form-grid"><label>Invoice title<input name="invoiceTitle" value="${esc(b.invoiceTitle||"TAX INVOICE")}"></label><label>Invoice prefix<input name="invoicePrefix" value="${esc(b.invoicePrefix||"INV")}"></label><label>Receipt width<select name="receiptPaperWidth"><option ${b.receiptPaperWidth==58?"selected":""}>58</option><option ${b.receiptPaperWidth!=58?"selected":""}>80</option></select></label><label>UPI ID<input name="upiId" value="${esc(b.upiId||"")}"></label><label>UPI Name<input name="upiName" value="${esc(b.upiName||"")}"></label><label>Tax rate %<input name="taxRate" type="number" step="0.01" value="${esc(b.taxRate||0)}"></label><label class="check"><input name="taxEnabled" type="checkbox" ${b.taxEnabled?"checked":""}> Enable tax</label><label class="check"><input name="paymentCashEnabled" type="checkbox" ${b.paymentCashEnabled!==false?"checked":""}> Cash</label><label class="check"><input name="paymentUpiEnabled" type="checkbox" ${b.paymentUpiEnabled!==false?"checked":""}> UPI</label><label class="check"><input name="paymentCardEnabled" type="checkbox" ${b.paymentCardEnabled!==false?"checked":""}> Card</label><label class="wide">Receipt header<input name="receiptHeader" value="${esc(b.receiptHeader||"")}"></label><label class="wide">Receipt footer<textarea name="receiptFooter">${esc(b.receiptFooter||"Thank you. Visit again.")}</textarea></label><div class="modal-actions wide"><button class="btn btn-dark">Save settings</button></div></form></div>`;
  $("settingsForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const body={invoiceTitle:f.get("invoiceTitle"),invoicePrefix:f.get("invoicePrefix"),receiptPaperWidth:Number(f.get("receiptPaperWidth")),upiId:f.get("upiId"),upiName:f.get("upiName"),taxRate:Number(f.get("taxRate")||0),taxEnabled:f.has("taxEnabled"),paymentCashEnabled:f.has("paymentCashEnabled"),paymentUpiEnabled:f.has("paymentUpiEnabled"),paymentCardEnabled:f.has("paymentCardEnabled"),receiptHeader:f.get("receiptHeader"),receiptFooter:f.get("receiptFooter")};try{await api(`/api/branches/${b.id}`,{method:"PATCH",body:JSON.stringify(body)});await loadBranches();state.branch=state.branches.find(x=>x.id===b.id)||state.branch;await loadMenu();renderSettingsPanel(p);toast("Settings saved");}catch(x){toast(x.message,"error");}};
}
function renderProfile(){
  openModal(`<div class="modal-head"><div><span class="eyebrow">ACCOUNT</span><h2>${esc(state.user.name)}</h2></div><button class="icon-btn" data-close-modal>×</button></div><div class="profile-big"><div class="avatar large">${esc(initials(state.user.name))}</div><b>${esc(state.user.username)}</b><span class="role-pill">${esc(state.user.role)}</span><small>${esc(state.branch?.name||"")}</small></div><div class="modal-actions"><button id="changePass" class="btn btn-light">Change password</button><button id="logout" class="btn btn-danger">Logout</button></div>`);
  $("logout").onclick=logout;$("changePass").onclick=()=>passwordModal();
}
function passwordModal(){
  openModal(`<div class="modal-head"><div><span class="eyebrow">SECURITY</span><h2>Change password</h2></div><button class="icon-btn" data-close-modal>×</button></div><form id="passForm" class="form-grid"><label class="wide">Current password<input name="current" type="password" required></label><label class="wide">New password<input name="next" type="password" minlength="8" required></label><div class="modal-actions wide"><button class="btn btn-light" type="button" data-close-modal>Cancel</button><button class="btn btn-dark">Change</button></div></form>`);
  $("passForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api("/api/me/password",{method:"POST",body:JSON.stringify({currentPassword:f.get("current"),newPassword:f.get("next")})});closeModal();toast("Password changed. Please sign in again.");setTimeout(logout,700);}catch(x){toast(x.message,"error");}};
}
function bindGlobal(){
  $("loginForm").onsubmit=e=>{e.preventDefault();login();};
  $("togglePassword").onclick=()=>{$("password").type=$("password").type==="password"?"text":"password";$("togglePassword").textContent=$("password").type==="password"?"Show":"Hide";};
  $("branchSwitcher").onchange=e=>switchBranch(e.target.value);
  $("profileButton").onclick=renderProfile;$("mobileProfile").onclick=renderProfile;
  $("mobileMenu").onclick=()=>document.body.classList.toggle("nav-open");
  document.addEventListener("click",e=>{if(e.target.closest("[data-close-modal]"))closeModal();});
  document.addEventListener("keydown",e=>{if(e.key==="F1"){e.preventDefault();showView("billing");}if(e.key==="Escape")closeModal();});
}
async function bootApp(){
  $("loginScreen").classList.add("hidden");$("appScreen").classList.remove("hidden");
  $("profileInitial").textContent=initials(state.user.name);$("profileName").textContent=state.user.name;$("profileRole").textContent=state.user.role;
  await loadBranches();await loadBranchData();renderNav();renderView();
  clearInterval(state.orderTimer);state.orderTimer=setInterval(async()=>{await loadOrders(true);if(["orders","qr-orders","kds"].includes(state.activeView))renderView();},5000);
  clearInterval(state.menuTimer);state.menuTimer=setInterval(async()=>{try{await loadMenu();if(state.activeView==="billing")renderBilling();}catch{}},30000);
}
async function boot(){
  bindGlobal();
  setTimeout(async()=>{$("splash").classList.add("hidden");if(await getSession()){try{await bootApp();}catch(e){$("loginScreen").classList.remove("hidden");$("loginError").textContent=e.message;$("loginError").classList.remove("hidden");}}else $("loginScreen").classList.remove("hidden");},450);
}
boot();
})();