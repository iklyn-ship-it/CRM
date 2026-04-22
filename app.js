const SUPABASE_URL = "https://alxckrhyqtmejelhzbej.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sVWiQsMYQb349INaIMh_Rw_8CwbOac5";
const CRM_STATE_TABLE = "crm_state";
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let authUserId = "";
let saveTimer = null;
const state = {
  clients: [], equipment: [], operators: [], orders: [], operations: [], repairs: [],
  calendarDate: new Date(), chartMode: "bars", calendarMode: "month",
  integrations: { googleFormsUrl: "", autoSync: false, importedResponseIds: [], lastSyncAt: "", lastSyncStatus: "" }
};
function $(id){ return document.getElementById(id); }
function on(id, event, handler){
  const el = $(id);
  if(el) el.addEventListener(event, handler);
}
function uid(p){ return p + "_" + Math.random().toString(36).slice(2,9); }
function serializeState(){
  return {clients:state.clients,equipment:state.equipment,operators:state.operators,orders:state.orders,operations:state.operations,repairs:state.repairs,chartMode:state.chartMode,calendarMode:state.calendarMode,integrations:state.integrations};
}
function applyState(raw){
  state.clients=raw.clients||[]; state.equipment=raw.equipment||[]; state.operators=raw.operators||[];
  state.orders=raw.orders||[]; state.operations=raw.operations||[]; state.repairs=raw.repairs||[];
  state.chartMode=raw.chartMode||"bars"; state.calendarMode=raw.calendarMode||"month";
  state.integrations={
    googleFormsUrl: raw.integrations?.googleFormsUrl || "",
    autoSync: Boolean(raw.integrations?.autoSync),
    importedResponseIds: Array.isArray(raw.integrations?.importedResponseIds) ? raw.integrations.importedResponseIds : [],
    lastSyncAt: raw.integrations?.lastSyncAt || "",
    lastSyncStatus: raw.integrations?.lastSyncStatus || ""
  };
}
function resetState(){
  state.clients=[]; state.equipment=[]; state.operators=[]; state.orders=[]; state.operations=[]; state.repairs=[];
  state.chartMode="bars"; state.calendarMode="month";
  state.integrations={ googleFormsUrl: "", autoSync: false, importedResponseIds: [], lastSyncAt: "", lastSyncStatus: "" };
}
function hasMeaningfulCloudState(payload){
  if(!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  return ["clients","equipment","operators","orders","operations","repairs","integrations","chartMode","calendarMode"]
    .some(key => Object.prototype.hasOwnProperty.call(payload, key));
}
function scheduleCloudSave(){
  if(!authUserId || !supabaseClient) return;
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCloudState, 500);
}
async function saveCloudState(){
  if(!authUserId || !supabaseClient) return;
  const { error } = await supabaseClient
    .from(CRM_STATE_TABLE)
    .upsert({ user_id: authUserId, data: serializeState() }, { onConflict: "user_id" });
  if(error){
    renderAuthStatus("error", `Ошибка сохранения в облако: ${error.message}`);
    return;
  }
  renderAuthStatus("ok", `Авторизован: ${authUserId}. Данные синхронизируются с облаком.`);
}
async function loadCloudState(){
  if(!authUserId || !supabaseClient) return;
  const localSnapshot = serializeState();
  const { data, error } = await supabaseClient
    .from(CRM_STATE_TABLE)
    .select("data")
    .eq("user_id", authUserId)
    .maybeSingle();
  if(error){
    renderAuthStatus("error", `Ошибка загрузки из облака: ${error.message}`);
    return;
  }
  if(data?.data && hasMeaningfulCloudState(data.data)){
    applyState(data.data);
    renderAll();
    refreshIntegrationForm();
    return;
  }
  applyState(localSnapshot);
  renderAll();
  refreshIntegrationForm();
  await saveCloudState();
}
function save(){
  if(!authUserId) return;
  scheduleCloudSave();
}
function esc(v){
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function money(v){ return "₴" + Number(v||0).toLocaleString("uk-UA"); }
function fmtDate(v){ if(!v) return "—"; return new Date(v+"T00:00:00").toLocaleDateString("uk-UA"); }
function daysInclusive(s,e){ return Math.max(1, Math.floor((new Date(e+"T00:00:00")-new Date(s+"T00:00:00"))/86400000)+1); }
function badge(cls, text){ return `<span class="badge ${cls}">${text}</span>`; }
function statusBadge(s){ return {new:badge("new","Новое"),confirmed:badge("confirmed","Подтверждена"),active:badge("active","В работе"),completed:badge("completed","Завершена"),cancelled:badge("cancelled","Отменена")}[s] || badge("new","Новое"); }
function repairStatusBadge(s){ return {planned:badge("repairplan","Запланирован"),active:badge("repairstatus","В ремонте"),completed:badge("completed","Завершён"),cancelled:badge("cancelled","Отменён")}[s] || badge("repairplan","Запланирован"); }
function typeBadge(t){ return t==="income" ? badge("income","Приход") : badge("expense","Расход"); }
function eqBadge(s){ return {free:badge("free","Свободна"),busy:badge("busy","В работе"),repair:badge("repairstatus","Ремонт")}[s] || badge("free","Свободна"); }
function overlap(a1,a2,b1,b2){ return new Date(a1)<=new Date(b2) && new Date(b1)<=new Date(a2); }
function byId(arr,id){ return arr.find(x=>x.id===id); }
function normalizeText(v){ return String(v || "").trim().toLowerCase(); }
function orderPlan(order){ return daysInclusive(order.startDate, order.endDate) * Number(order.rate||0); }
function orderOps(orderId){ return state.operations.filter(o => o.orderId === orderId); }
function orderIncome(orderId){ return orderOps(orderId).filter(o=>o.type==="income").reduce((s,o)=>s+Number(o.amount||0),0); }
function orderExpense(orderId){ return orderOps(orderId).filter(o=>o.type==="expense").reduce((s,o)=>s+Number(o.amount||0),0); }
function orderProfit(orderId){ return orderIncome(orderId) - orderExpense(orderId); }
function orderRemaining(order){ return Math.max(0, orderPlan(order) - orderIncome(order.id)); }
function repairOps(repairId){ return state.operations.filter(o => o.repairId === repairId); }
function repairExpense(repairId){ return repairOps(repairId).filter(o=>o.type==="expense").reduce((s,o)=>s+Number(o.amount||0),0); }
function allIncome(){ return state.operations.filter(o=>o.type==="income").reduce((s,o)=>s+Number(o.amount||0),0); }
function allExpense(){ return state.operations.filter(o=>o.type==="expense").reduce((s,o)=>s+Number(o.amount||0),0); }

function runtimeEqStatus(eq){
  const now = new Date().toISOString().slice(0,10);
  const activeRepair = state.repairs.some(r => r.equipmentId===eq.id && r.status!=="cancelled" && r.status!=="completed" && r.startDate<=now && r.endDate>=now);
  if(activeRepair || eq.status==="repair") return "repair";
  const used = state.orders.some(o => o.equipmentId===eq.id && o.status!=="cancelled" && o.startDate<=now && o.endDate>=now);
  return used ? "busy" : "free";
}
function utilForEq(eqId, date){
  const year=date.getFullYear(), month=date.getMonth(), monthStart=new Date(year,month,1), monthEnd=new Date(year,month+1,0);
  const dim=monthEnd.getDate();
  const busyDays = new Set();
  const periods = [
    ...state.orders.filter(o=>o.equipmentId===eqId && o.status!=="cancelled").map(o=>({s:o.startDate,e:o.endDate})),
    ...state.repairs.filter(r=>r.equipmentId===eqId && r.status!=="cancelled").map(r=>({s:r.startDate,e:r.endDate}))
  ];
  periods.forEach(p=>{
    const s=new Date(p.s+"T00:00:00"), e=new Date(p.e+"T00:00:00");
    const from=new Date(Math.max(s, monthStart)), to=new Date(Math.min(e, monthEnd));
    if(from<=to){
      for(let day=new Date(from); day<=to; day.setDate(day.getDate()+1)){
        busyDays.add(day.toISOString().slice(0,10));
      }
    }
  });
  return Math.round((busyDays.size/dim)*100);
}
function orderConflicts(){
  const list=[]; const orders=state.orders.filter(o=>o.status!=="cancelled");
  for(let i=0;i<orders.length;i++) for(let j=i+1;j<orders.length;j++){
    const a=orders[i], b=orders[j];
    if(a.equipmentId && a.equipmentId===b.equipmentId && overlap(a.startDate,a.endDate,b.startDate,b.endDate)) list.push([a.id,b.id,a.equipmentId]);
  }
  return list;
}
function repairConflicts(){
  const list=[];
  const activeRepairs=state.repairs.filter(r=>r.status!=="cancelled" && r.status!=="completed");
  activeRepairs.forEach(r=>{
    state.orders.filter(o=>o.status!=="cancelled" && o.equipmentId===r.equipmentId && overlap(o.startDate,o.endDate,r.startDate,r.endDate)).forEach(o=>{
      list.push([r.id,o.id,r.equipmentId]);
    });
  });
  return list;
}

function refreshSelects(){
  $("orderClient").innerHTML = '<option value="">— выбрать —</option>' + state.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  const eqOptions = '<option value="">— выбрать —</option>' + state.equipment.map(e=>`<option value="${e.id}" data-rate="${e.defaultRate||0}">${esc(e.name)}</option>`).join("");
  $("orderEquipment").innerHTML = eqOptions;
  $("repairEquipment").innerHTML = eqOptions;
  $("orderOperator").innerHTML = '<option value="">— без оператора —</option>' + state.operators.map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join("");
  $("opOrder").innerHTML = '<option value="">— без привязки —</option>' + state.orders.map(o=>{
    const cl=esc(byId(state.clients,o.clientId)?.name || "Клиент");
    const eq=esc(byId(state.equipment,o.equipmentId)?.name || "Техника");
    return `<option value="${o.id}">${o.id.slice(-5)} • ${cl} • ${eq}</option>`;
  }).join("");
  $("opRepair").innerHTML = '<option value="">— без привязки —</option>' + state.repairs.map(r=>{
    const eq=esc(byId(state.equipment,r.equipmentId)?.name || "Техника");
    return `<option value="${r.id}">${r.id.slice(-5)} • ${eq}</option>`;
  }).join("");
}

function equipmentAnalytics(){
  return state.equipment.map(eq=>{
    const related=state.orders.filter(o=>o.equipmentId===eq.id);
    const repairRelated=state.repairs.filter(r=>r.equipmentId===eq.id);
    const income=related.reduce((s,o)=>s+orderIncome(o.id),0);
    const orderExp=related.reduce((s,o)=>s+orderExpense(o.id),0);
    const repairExp=repairRelated.reduce((s,r)=>s+repairExpense(r.id),0);
    const expense=orderExp+repairExp;
    return {name:eq.name, income, expense, profit:income-expense};
  }).sort((a,b)=>b.profit-a.profit).slice(0,8);
}
function renderDashboardChart(){
  const data = equipmentAnalytics();
  const wrap = $("dashboardChart");
  if(!data.length){ wrap.innerHTML = '<div class="empty">Добавь технику, заявки, ремонты и операции — графики появятся здесь.</div>'; return; }
  const maxProfit = Math.max(1, ...data.map(x=>Math.abs(x.profit)));
  const maxIncome = Math.max(1, ...data.map(x=>x.income));
  const maxExpense = Math.max(1, ...data.map(x=>x.expense));

  if(state.chartMode === "bars"){
    wrap.innerHTML = `<div class="chart-bar-wrap">` + data.map(x=>{
      const h = Math.max(12, Math.abs(x.profit)/maxProfit*100);
      return `<div class="bar-col">
        <div class="bar-stack">
          <div class="bar-seg bar-profit" style="height:${h}%"><div class="bar-value">${money(x.profit)}</div></div>
        </div>
        <div class="bar-label">${esc(x.name)}</div>
      </div>`;
    }).join("") + `</div>`;
  } else if(state.chartMode === "stacked"){
    wrap.innerHTML = `<div class="chart-bar-wrap">` + data.map(x=>{
      const hi = Math.max(8, x.income/maxIncome*100);
      const he = x.expense ? Math.max(8, x.expense/maxExpense*70) : 0;
      const hp = Math.max(8, Math.abs(x.profit)/maxProfit*35);
      return `<div class="bar-col">
        <div class="bar-stack">
          <div class="bar-seg bar-expense" style="height:${he}%"></div>
          <div class="bar-seg bar-income" style="height:${hi}%"></div>
          <div class="bar-seg bar-profit" style="height:${hp}%"><div class="bar-value">${money(x.profit)}</div></div>
        </div>
        <div class="bar-label">${esc(x.name)}</div>
      </div>`;
    }).join("") + `</div>
    <div class="legend">
      <div class="chip"><span class="dot" style="background:#22c55e"></span> доход</div>
      <div class="chip"><span class="dot" style="background:#f97316"></span> расход</div>
      <div class="chip"><span class="dot" style="background:#38bdf8"></span> прибыль</div>
    </div>`;
  } else if(state.chartMode === "horizontal"){
    wrap.innerHTML = `<div class="hchart-list">` + data.map(x=>{
      const w = Math.max(4, Math.abs(x.profit)/maxProfit*100);
      return `<div class="hchart-row">
        <div class="hchart-name">${esc(x.name)}</div>
        <div class="hchart-track"><div class="hchart-fill profit" style="width:${w}%"></div></div>
        <div class="hchart-val">${money(x.profit)}</div>
      </div>`;
    }).join("") + `</div>`;
  } else if(state.chartMode === "donut"){
    const total = data.reduce((s,x)=>s+Math.max(0,x.profit),0) || 1;
    let acc = 0;
    const colors = ["#38bdf8","#22c55e","#8b5cf6","#f59e0b","#f97316","#60a5fa","#4ade80","#a78bfa"];
    const stops = [];
    data.forEach((x,i)=>{
      const part = Math.max(0,x.profit)/total*100;
      const start = acc; const end = acc + part;
      stops.push(`${colors[i%colors.length]} ${start}% ${end}%`);
      acc = end;
    });
    wrap.innerHTML = `<div class="donut-wrap">
      <div class="donut" style="background:conic-gradient(${stops.join(",")})">
        <div class="donut-hole"><div class="small">Общая прибыль</div><strong>${money(data.reduce((s,x)=>s+x.profit,0))}</strong></div>
      </div>
      <div class="donut-legend">` + data.map((x,i)=>`<div class="donut-item"><div><span class="dot" style="background:${colors[i%colors.length]}"></span> ${esc(x.name)}</div><div>${money(x.profit)}</div></div>`).join("") + `</div>
    </div>`;
  }
}

function renderDashboard(){
  const income=allIncome(), expense=allExpense(), profit=income-expense;
  $("mRevenue").textContent = money(income);
  $("mExpense").textContent = money(expense);
  $("mProfit").textContent = money(profit);
  $("mOrders").textContent = state.orders.filter(o=>["new","confirmed","active"].includes(o.status)).length;
  $("mRepairs").textContent = state.repairs.filter(r=>["planned","active"].includes(r.status)).length;
  const avgUtil = state.equipment.length ? Math.round(state.equipment.reduce((s,e)=>s+utilForEq(e.id,new Date()),0)/state.equipment.length) : 0;
  $("mUtil").textContent = avgUtil + "%";

  const conf = orderConflicts();
  const repConf = repairConflicts();
  const alerts = [];
  if(conf.length) alerts.push(`<div class="alert">Есть ${conf.length} конфликт(ов) по пересечению заявок на одну технику.</div>`);
  else alerts.push(`<div class="ok">Конфликтов по аренде сейчас нет.</div>`);
  if(repConf.length) alerts.push(`<div class="alert">Есть ${repConf.length} конфликт(ов) между арендой и ремонтом.</div>`);
  else alerts.push(`<div class="ok">Конфликтов между ремонтом и арендой нет.</div>`);
  $("alerts").innerHTML = alerts.join("");

  const eqStats = equipmentAnalytics();
  $("topList").innerHTML = eqStats.length ? eqStats.map((x,i)=>`<div class="item"><div><strong>${i+1}. ${esc(x.name)}</strong><div class="small">Факт прибыли с учётом ремонтов</div></div><div><strong>${money(x.profit)}</strong></div></div>`).join("") : `<div class="empty">Пока нет данных по технике.</div>`;
  renderDashboardChart();

  const today = new Date().toISOString().slice(0,10);
  const events = [
    ...state.orders.map(o=>({kind:"Аренда", startDate:o.startDate, endDate:o.endDate, label:esc(byId(state.clients,o.clientId)?.name||"—"), equipment:esc(byId(state.equipment,o.equipmentId)?.name||"—"), status:statusBadge(o.status), value:money(orderProfit(o.id))})),
    ...state.repairs.map(r=>({kind:"Ремонт", startDate:r.startDate, endDate:r.endDate, label:esc(r.tasks||"—"), equipment:esc(byId(state.equipment,r.equipmentId)?.name||"—"), status:repairStatusBadge(r.status), value:money(-repairExpense(r.id))}))
  ].filter(e=>e.endDate >= today)
   .sort((a,b)=>a.startDate.localeCompare(b.startDate))
   .slice(0,8);

  $("upcomingBody").innerHTML = events.length ? events.map(e=>`<tr><td>${fmtDate(e.startDate)} — ${fmtDate(e.endDate)}</td><td>${e.kind}</td><td>${e.label}</td><td>${e.equipment}</td><td>${e.status}</td><td>${e.value}</td></tr>`).join("") : `<tr><td colspan="6"><div class="empty">Пока нет событий.</div></td></tr>`;

  const linkedIncome = state.operations.filter(o=>o.type==="income" && o.orderId).reduce((s,o)=>s+Number(o.amount||0),0);
  const repairSpend = state.operations.filter(o=>o.type==="expense" && o.repairId).reduce((s,o)=>s+Number(o.amount||0),0);
  const linkedExpense = state.operations.filter(o=>o.type==="expense" && o.orderId).reduce((s,o)=>s+Number(o.amount||0),0);
  $("dashFinanceList").innerHTML = [
    ["Доход по аренде", money(linkedIncome)],
    ["Расходы по аренде", money(linkedExpense)],
    ["Расходы на ремонты", money(repairSpend)],
    ["Общий cashflow", money(profit)]
  ].map(x=>`<div class="item"><div>${x[0]}</div><div><strong>${x[1]}</strong></div></div>`).join("");
}
function renderOrders(){
  const q = $("orderSearch").value.trim().toLowerCase();
  const fs = $("orderFilterStatus").value;
  const conf=orderConflicts();
  const confSet=new Set(conf.flatMap(x=>[x[0],x[1]]));
  $("conflictBox").innerHTML = conf.length ? `<div class="alert">Найдены пересечения по аренде.</div>` : `<div class="ok">Пересечений по аренде не найдено.</div>`;

  let list=[...state.orders];
  if(fs) list=list.filter(o=>o.status===fs);
  if(q){
    list=list.filter(o=>{
      const cl=(byId(state.clients,o.clientId)?.name||"").toLowerCase();
      const eq=(byId(state.equipment,o.equipmentId)?.name||"").toLowerCase();
      const loc=(o.location||"").toLowerCase();
      return cl.includes(q)||eq.includes(q)||loc.includes(q)||o.id.toLowerCase().includes(q);
    });
  }
  list.sort((a,b)=>b.startDate.localeCompare(a.startDate));
  $("ordersBody").innerHTML = list.length ? list.map(o=>{
    const cl=esc(byId(state.clients,o.clientId)?.name||"—"); const eq=esc(byId(state.equipment,o.equipmentId)?.name||"—");
    const confMark = confSet.has(o.id) ? `<div class="small" style="color:#fca5a5">Конфликт по технике</div>` : "";
    return `<tr>
      <td>${o.id.slice(-5)}</td>
      <td>${fmtDate(o.startDate)}<div class="small">${fmtDate(o.endDate)} • ${daysInclusive(o.startDate,o.endDate)} дн.</div>${confMark}</td>
      <td>${cl}</td>
      <td>${eq}</td>
      <td>${money(orderPlan(o))}</td>
      <td>${money(orderIncome(o.id))}</td>
      <td>${money(orderExpense(o.id))}</td>
      <td>${money(orderProfit(o.id))}</td>
      <td>${statusBadge(o.status)}</td>
      <td><button class="btn ghost" onclick="editOrder('${o.id}')">Редактировать</button><button class="btn ghost" onclick="removeOrder('${o.id}')">Удалить</button></td>
    </tr>`;
  }).join("") : `<tr><td colspan="10"><div class="empty">Ничего не найдено.</div></td></tr>`;
}
function renderRepairs(){
  const q = $("repairSearch").value.trim().toLowerCase();
  const fs = $("repairFilterStatus").value;
  const conf=repairConflicts();
  const confSet=new Set(conf.flatMap(x=>[x[0],x[1]]));
  $("repairConflictBox").innerHTML = conf.length ? `<div class="alert">Найдены конфликты между арендой и ремонтом.</div>` : `<div class="ok">Конфликтов между арендой и ремонтом не найдено.</div>`;

  let list=[...state.repairs];
  if(fs) list=list.filter(r=>r.status===fs);
  if(q){
    list=list.filter(r=>{
      const eq=(byId(state.equipment,r.equipmentId)?.name||"").toLowerCase();
      return eq.includes(q)||(r.tasks||"").toLowerCase().includes(q)||(r.notes||"").toLowerCase().includes(q)||r.id.toLowerCase().includes(q);
    });
  }
  list.sort((a,b)=>b.startDate.localeCompare(a.startDate));
  $("repairsBody").innerHTML = list.length ? list.map(r=>{
    const eq=esc(byId(state.equipment,r.equipmentId)?.name||"—");
    const confMark = confSet.has(r.id) ? `<div class="small" style="color:#fca5a5">Пересекается с арендой</div>` : "";
    return `<tr>
      <td>${r.id.slice(-5)}</td>
      <td>${fmtDate(r.startDate)}<div class="small">${fmtDate(r.endDate)} • ${daysInclusive(r.startDate,r.endDate)} дн.</div>${confMark}</td>
      <td>${eq}</td>
      <td>${esc(r.tasks||"—")}</td>
      <td>${esc(r.notes||"—")}</td>
      <td>${repairStatusBadge(r.status)}</td>
      <td><button class="btn ghost" onclick="editRepair('${r.id}')">Редактировать</button><button class="btn ghost" onclick="removeRepair('${r.id}')">Удалить</button></td>
    </tr>`;
  }).join("") : `<tr><td colspan="7"><div class="empty">Ремонтов пока нет.</div></td></tr>`;
}
function renderCalendarMonth(){
  const d=state.calendarDate, y=d.getFullYear(), m=d.getMonth();
  const start=new Date(y,m,1), end=new Date(y,m+1,0), startWeek=(start.getDay()+6)%7, dim=end.getDate();
  const names=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
  let html=`<div class="cal">` + names.map(n=>`<div class="cal-h">${n}</div>`).join("");
  let cell=1-startWeek, weeks=Math.ceil((startWeek+dim)/7);
  for(let w=0;w<weeks;w++){
    for(let i=0;i<7;i++,cell++){
      const cur=new Date(y,m,cell);
      const inMonth=cur.getMonth()===m;
      const ds=cur.toISOString().slice(0,10);
      const rentEntries=state.orders.filter(o=>o.status!=="cancelled" && o.startDate<=ds && o.endDate>=ds).map(o=>{
        const eq=esc(byId(state.equipment,o.equipmentId)?.name || "Техника");
        const cl=esc(byId(state.clients,o.clientId)?.name || "Клиент");
        return {...o,eq,cl,type:"rent"};
      });
      const repairEntries=state.repairs.filter(r=>r.status!=="cancelled" && r.startDate<=ds && r.endDate>=ds).map(r=>{
        const eq=esc(byId(state.equipment,r.equipmentId)?.name || "Техника");
        return {...r,eq,cl:esc(r.tasks||"Ремонт"),type:"repair"};
      });
      const entries=[...rentEntries,...repairEntries];
      const cnt={}; entries.forEach(e=>cnt[e.equipmentId]=(cnt[e.equipmentId]||0)+1);
      html += `<div class="cal-c" style="${inMonth?'':'opacity:.45'}"><div><strong>${cur.getDate()}</strong> <span class="small">${cur.toLocaleDateString('ru-RU',{month:'short'})}</span></div>` +
        entries.slice(0,5).map(e=>`<div class="event ${e.type==='repair'?'repair':''} ${cnt[e.equipmentId]>1?'conflict':''}">${e.eq}<br><span class="small">${e.type==='repair'?'Ремонт: ':'Аренда: '}${e.cl}</span></div>`).join("") +
        (entries.length>5?`<div class="small" style="margin-top:6px">ещё ${entries.length-5}</div>`:"") + `</div>`;
    }
  }
  html += `</div>`;
  return html;
}
function renderCalendarTimeline(){
  const d=state.calendarDate, y=d.getFullYear(), m=d.getMonth();
  const start=new Date(y,m,1), end=new Date(y,m+1,0), dim=end.getDate();
  let html = `<div class="timeline-wrap">`;
  html += `<div class="timeline-head"><div class="timeline-left"><strong>Техника</strong><div class="timeline-note">Полоса = резерв</div></div>`;
  for(let day=1; day<=31; day++){
    if(day<=dim){
      const date = new Date(y,m,day);
      html += `<div class="timeline-day">${day}<span class="small">${date.toLocaleDateString('ru-RU',{weekday:'short'})}</span></div>`;
    } else {
      html += `<div class="timeline-day" style="opacity:.25">${day}</div>`;
    }
  }
  html += `</div>`;

  const allConflicts = new Set([
    ...orderConflicts().map(x=>x[0]), ...orderConflicts().map(x=>x[1]),
    ...repairConflicts().map(x=>x[0]), ...repairConflicts().map(x=>x[1])
  ]);

  state.equipment.forEach(eq=>{
    html += `<div class="timeline-row">`;
    html += `<div class="timeline-left"><strong>${esc(eq.name)}</strong><div class="timeline-note">${esc(eq.type || "—")}</div></div>`;
    for(let day=1; day<=31; day++){
      html += `<div class="timeline-cell"></div>`;
    }
    html += `</div>`;

    const rowEvents = [
      ...state.orders.filter(o=>o.equipmentId===eq.id && o.status!=="cancelled").map(o=>({id:o.id,type:"rent",title:esc(byId(state.clients,o.clientId)?.name || "Аренда"),startDate:o.startDate,endDate:o.endDate,conflict:allConflicts.has(o.id)})),
      ...state.repairs.filter(r=>r.equipmentId===eq.id && r.status!=="cancelled").map(r=>({id:r.id,type:"repair",title:esc(r.tasks || "Ремонт"),startDate:r.startDate,endDate:r.endDate,conflict:allConflicts.has(r.id)}))
    ];
    const rowIndex = state.equipment.findIndex(e => e.id === eq.id);
    const containerTop = 53 * (rowIndex + 1) + 1;
    rowEvents.forEach(ev=>{
      const s = new Date(ev.startDate+"T00:00:00");
      const e = new Date(ev.endDate+"T00:00:00");
      const from = new Date(Math.max(s, start));
      const to = new Date(Math.min(e, end));
      if(from > to) return;
      const startDay = from.getDate();
      const endDay = to.getDate();
      const left = 240 + (startDay - 1) * 34 + 2;
      const width = ((endDay - startDay + 1) * 34) - 4;
      html += `<div class="reserve-bar ${ev.type} ${ev.conflict ? 'conflict' : ''}" style="left:${left}px; top:${containerTop + 9}px; width:${width}px; position:absolute">${ev.type==='repair' ? 'Ремонт' : 'Аренда'} • ${ev.title}</div>`;
    });
  });
  html += `</div>`;
  return `<div style="position:relative">${html}</div>`;
}
function renderCalendar(){
  const d=state.calendarDate;
  $("monthLabel").textContent = d.toLocaleDateString("ru-RU",{month:"long",year:"numeric"});
  $("calendarMode").value = state.calendarMode;
  if(state.calendarMode === "timeline"){
    $("calendarWrap").innerHTML = renderCalendarTimeline();
  } else {
    $("calendarWrap").innerHTML = renderCalendarMonth();
  }
}
function renderFinance(){
  const q=$("opSearch").value.trim().toLowerCase(), ft=$("opFilterType").value;
  let ops=[...state.operations].sort((a,b)=>b.date.localeCompare(a.date));
  if(ft) ops=ops.filter(o=>o.type===ft);
  if(q) ops=ops.filter(o=>(o.category||"").toLowerCase().includes(q) || (o.comment||"").toLowerCase().includes(q) || o.id.toLowerCase().includes(q));
  $("operationsBody").innerHTML = ops.length ? ops.map(o=>{
    let linkText = "—";
    if(o.orderId){
      const ord = byId(state.orders,o.orderId);
      if(ord) linkText = `Аренда ${ord.id.slice(-5)} • ${byId(state.clients,ord.clientId)?.name || ""}`;
    } else if(o.repairId){
      const rep = byId(state.repairs,o.repairId);
      if(rep) linkText = `Ремонт ${rep.id.slice(-5)} • ${byId(state.equipment,rep.equipmentId)?.name || ""}`;
    }
    return `<tr>
      <td>${fmtDate(o.date)}</td><td>${typeBadge(o.type)}</td><td>${esc(o.category||"—")}</td><td>${money(o.amount)}</td><td>${esc(linkText)}</td><td>${esc(o.comment||"—")}</td>
      <td><button class="btn ghost" onclick="editOperation('${o.id}')">Редактировать</button><button class="btn ghost" onclick="removeOperation('${o.id}')">Удалить</button></td>
    </tr>`;
  }).join("") : `<tr><td colspan="7"><div class="empty">Финансовых операций пока нет.</div></td></tr>`;

  $("financeByOrderBody").innerHTML = state.orders.length ? state.orders.map(o=>{
    const cl=esc(byId(state.clients,o.clientId)?.name||"—");
    return `<tr><td>${o.id.slice(-5)}</td><td>${cl}</td><td>${money(orderPlan(o))}</td><td>${money(orderIncome(o.id))}</td><td>${money(orderExpense(o.id))}</td><td>${money(orderProfit(o.id))}</td><td>${money(orderRemaining(o))}</td></tr>`;
  }).join("") : `<tr><td colspan="7"><div class="empty">Нет заявок.</div></td></tr>`;

  $("financeByRepairBody").innerHTML = state.repairs.length ? state.repairs.map(r=>{
    const eq=esc(byId(state.equipment,r.equipmentId)?.name||"—");
    return `<tr><td>${r.id.slice(-5)}</td><td>${eq}</td><td>${money(repairExpense(r.id))}</td><td>${esc(r.tasks||"—")}</td><td>${repairStatusBadge(r.status)}</td></tr>`;
  }).join("") : `<tr><td colspan="5"><div class="empty">Нет ремонтов.</div></td></tr>`;
}
function renderEquipment(){
  $("equipmentBody").innerHTML = state.equipment.length ? state.equipment.map(eq=>{
    const repairs = state.repairs.filter(r=>r.equipmentId===eq.id && r.status!=="cancelled").length;
    return `<tr><td>${esc(eq.name)}</td><td>${esc(eq.type||"—")}</td><td>${esc(eq.code||"—")}</td><td>${money(eq.defaultRate||0)}</td><td>${eqBadge(runtimeEqStatus(eq))}</td><td>${utilForEq(eq.id,new Date())}%</td><td>${repairs}</td><td><button class="btn ghost" onclick="editEquipment('${eq.id}')">Редактировать</button><button class="btn ghost" onclick="removeEquipment('${eq.id}')">Удалить</button></td></tr>`;
  }).join("") : `<tr><td colspan="8"><div class="empty">Нет техники.</div></td></tr>`;
}
function renderClients(){
  $("clientsBody").innerHTML = state.clients.length ? state.clients.map(c=>{
    const ords=state.orders.filter(o=>o.clientId===c.id); const income=ords.reduce((s,o)=>s+orderIncome(o.id),0); const prof=ords.reduce((s,o)=>s+orderProfit(o.id),0);
    return `<tr><td>${esc(c.name)}<div class="small">${esc(c.notes||"")}</div></td><td>${esc(c.phone||"—")}</td><td>${esc(c.source||"—")}</td><td>${ords.length}</td><td>${money(income)}</td><td>${money(prof)}</td><td><button class="btn ghost" onclick="editClient('${c.id}')">Редактировать</button><button class="btn ghost" onclick="removeClient('${c.id}')">Удалить</button></td></tr>`;
  }).join("") : `<tr><td colspan="7"><div class="empty">Нет клиентов.</div></td></tr>`;
}
function renderOperators(){
  $("operatorsBody").innerHTML = state.operators.length ? state.operators.map(op=>{
    const ords=state.orders.filter(o=>o.operatorId===op.id && o.status!=="cancelled");
    const shifts=ords.reduce((s,o)=>s+daysInclusive(o.startDate,o.endDate),0);
    return `<tr><td>${esc(op.name)}</td><td>${esc(op.phone||"—")}</td><td>${esc(op.skill||"—")}</td><td>${shifts}</td><td>${money(shifts*Number(op.rate||0))}</td><td><button class="btn ghost" onclick="editOperator('${op.id}')">Редактировать</button><button class="btn ghost" onclick="removeOperator('${op.id}')">Удалить</button></td></tr>`;
  }).join("") : `<tr><td colspan="6"><div class="empty">Нет операторов.</div></td></tr>`;
}
function renderAll(){ refreshSelects(); renderDashboard(); renderOrders(); renderRepairs(); renderCalendar(); renderFinance(); renderEquipment(); renderClients(); renderOperators(); save(); }
function renderIntegrationStatus(kind, text){
  const box = $("integrationStatus");
  if(!box) return;
  box.innerHTML = text ? `<div class="${kind === "error" ? "alert" : "ok"}">${esc(text)}</div>` : "";
}
function renderAuthStatus(kind, text){
  const box = $("authStatus");
  if(!box) return;
  box.innerHTML = text ? `<div class="${kind === "error" ? "alert" : "ok"}">${esc(text)}</div>` : "";
}
function setAppAccess(isAuthorized){
  document.querySelectorAll(".section").forEach(section => {
    const isAuthSection = section.id === "section-auth";
    section.style.display = isAuthorized ? (isAuthSection ? "none" : "") : (isAuthSection ? "" : "none");
  });
  document.querySelectorAll(".nav-btn").forEach(btn => {
    const isAuth = btn.dataset.sec === "auth";
    btn.disabled = !isAuthorized && !isAuth;
  });
  if($("topActions")) $("topActions").style.display = isAuthorized ? "" : "none";
  if(!isAuthorized){
    activateSection("auth");
    if($("pageTitle")) $("pageTitle").textContent = "Авторизация";
    if($("pageSubtitle")) $("pageSubtitle").textContent = "Войди в аккаунт для доступа к данным CRM.";
  } else if($("section-auth") && $("section-auth").classList.contains("active")){
    activateSection("dashboard");
  }
}
function updateAuthUi(session){
  const user = session?.user || null;
  authUserId = user?.id || "";
  if($("authEmail")) $("authEmail").disabled = Boolean(user);
  if($("authPassword")) $("authPassword").disabled = Boolean(user);
  if($("authLoginBtn")) $("authLoginBtn").disabled = Boolean(user);
  if($("authSignupBtn")) $("authSignupBtn").disabled = Boolean(user);
  if($("authResetBtn")) $("authResetBtn").disabled = Boolean(user);
  setAppAccess(Boolean(user));
  if(user){
    renderAuthStatus("ok", `Вход выполнен: ${user.email}`);
  } else {
    renderAuthStatus("error", "Не авторизован. Войди, чтобы открыть CRM и синхронизацию.");
  }
}
async function initAuth(){
  if(!supabaseClient){
    renderAuthStatus("error", "Supabase SDK не загружен.");
    return;
  }
  const { data } = await supabaseClient.auth.getSession();
  updateAuthUi(data.session);
  if(data.session?.user){
    await loadCloudState();
    activateSection("dashboard");
  } else {
    resetState();
    renderAll();
    refreshIntegrationForm();
  }
  supabaseClient.auth.onAuthStateChange(async (_, session) => {
    updateAuthUi(session);
    if(session?.user){
      await loadCloudState();
      activateSection("dashboard");
    } else {
      resetState();
      renderAll();
      refreshIntegrationForm();
    }
  });
}
function refreshIntegrationForm(){
  if(!$("integrationUrl")) return;
  $("integrationUrl").value = state.integrations.googleFormsUrl || "";
  $("integrationAutoSync").checked = Boolean(state.integrations.autoSync);
  const details = state.integrations.lastSyncAt ? `${state.integrations.lastSyncStatus} Последняя синхронизация: ${new Date(state.integrations.lastSyncAt).toLocaleString("uk-UA")}.` : state.integrations.lastSyncStatus;
  if(details){
    renderIntegrationStatus(state.integrations.lastSyncStatus.startsWith("Ошибка") ? "error" : "ok", details);
  } else {
    renderIntegrationStatus("ok", "");
  }
}
function findEquipmentId(record){
  const code = normalizeText(record.equipmentCode);
  const name = normalizeText(record.equipmentName);
  const eq = state.equipment.find(item => (code && normalizeText(item.code) === code) || (name && normalizeText(item.name) === name));
  return eq?.id || "";
}
function findOperatorId(record){
  const name = normalizeText(record.operatorName);
  return name ? (state.operators.find(item => normalizeText(item.name) === name)?.id || "") : "";
}
function ensureClient(record){
  const phone = normalizeText(record.clientPhone);
  const name = String(record.clientName || "").trim();
  let client = state.clients.find(item => (phone && normalizeText(item.phone) === phone) || (name && normalizeText(item.name) === normalizeText(name)));
  if(client) return client.id;
  client = {
    id: uid("cl"),
    name: name || "Новый клиент",
    phone: String(record.clientPhone || "").trim(),
    source: String(record.clientSource || record.sourceLabel || "Google Form").trim(),
    type: "Разовый",
    notes: String(record.clientNotes || "").trim()
  };
  state.clients.push(client);
  return client.id;
}
function buildImportedOrder(record){
  const equipmentId = findEquipmentId(record);
  const notes = [
    String(record.notes || "").trim(),
    !equipmentId && (record.equipmentCode || record.equipmentName) ? `Техника из формы: ${record.equipmentCode || record.equipmentName}` : "",
    record.responseId ? `Google Form ID: ${record.responseId}` : "Google Form import"
  ].filter(Boolean).join("\n");
  return {
    id: uid("ord"),
    clientId: ensureClient(record),
    equipmentId,
    operatorId: findOperatorId(record),
    startDate: String(record.startDate || "").slice(0,10),
    endDate: String(record.endDate || "").slice(0,10),
    location: String(record.location || "").trim(),
    rate: Number(record.rate || 0),
    status: "new",
    notes
  };
}
function importGoogleFormResponses(records){
  let imported = 0;
  let skipped = 0;
  records.forEach(record => {
    const responseId = String(record.responseId || "").trim();
    const startDate = String(record.startDate || "").slice(0,10);
    const endDate = String(record.endDate || "").slice(0,10);
    if((responseId && state.integrations.importedResponseIds.includes(responseId)) || !record.clientName || !startDate || !endDate){
      skipped += 1;
      return;
    }
    state.orders.push(buildImportedOrder(record));
    if(responseId) state.integrations.importedResponseIds.push(responseId);
    imported += 1;
  });
  state.integrations.lastSyncAt = new Date().toISOString();
  state.integrations.lastSyncStatus = imported ? `Импортировано заявок: ${imported}. Пропущено: ${skipped}.` : `Новых заявок не найдено. Пропущено: ${skipped}.`;
  renderAll();
  refreshIntegrationForm();
}
let googleFormsSyncInFlight = false;
function syncGoogleForms(manual){
  const url = (state.integrations.googleFormsUrl || "").trim();
  if(!url){
    renderIntegrationStatus("error", "Сначала укажи URL Google Apps Script Web App.");
    return;
  }
  if(googleFormsSyncInFlight) return;
  googleFormsSyncInFlight = true;
  renderIntegrationStatus("ok", "Идёт загрузка заявок из Google Forms...");
  const callbackName = `crmGoogleFormsCallback_${Date.now()}`;
  window[callbackName] = payload => {
    try{
      if(payload?.error) throw new Error(payload.error);
      importGoogleFormResponses(Array.isArray(payload?.items) ? payload.items : []);
    }catch(err){
      state.integrations.lastSyncAt = new Date().toISOString();
      state.integrations.lastSyncStatus = `Ошибка синхронизации: ${err.message}`;
      refreshIntegrationForm();
    }finally{
      googleFormsSyncInFlight = false;
      delete window[callbackName];
    }
  };
  const script = document.createElement("script");
  const separator = url.includes("?") ? "&" : "?";
  script.src = `${url}${separator}callback=${callbackName}&t=${Date.now()}${manual ? "&manual=1" : ""}`;
  script.async = true;
  script.onerror = () => {
    googleFormsSyncInFlight = false;
    delete window[callbackName];
    state.integrations.lastSyncAt = new Date().toISOString();
    state.integrations.lastSyncStatus = "Ошибка синхронизации: не удалось загрузить данные из Google Apps Script.";
    refreshIntegrationForm();
  };
  document.body.appendChild(script);
}

function clearEquipmentForm(){
  $("equipmentId").value=""; $("equipmentForm").reset(); $("eqStatus").value="free";
  $("equipmentFormTitle").textContent="Добавить технику"; $("equipmentSaveBtn").textContent="Сохранить технику"; $("equipmentCancelEditBtn").classList.add("hidden");
}
function editEquipment(id){
  const eq=byId(state.equipment,id); if(!eq) return;
  $("equipmentId").value=eq.id; $("eqName").value=eq.name||""; $("eqType").value=eq.type||""; $("eqCode").value=eq.code||""; $("eqRate").value=eq.defaultRate||0; $("eqStatus").value=eq.status||"free";
  $("equipmentFormTitle").textContent="Редактирование техники"; $("equipmentSaveBtn").textContent="Сохранить изменения"; $("equipmentCancelEditBtn").classList.remove("hidden");
  activateSection("equipment");
}
function clearClientForm(){
  $("clientId").value=""; $("clientForm").reset(); $("clientType").value="Разовый";
  $("clientFormTitle").textContent="Добавить клиента"; $("clientSaveBtn").textContent="Сохранить клиента"; $("clientCancelEditBtn").classList.add("hidden");
}
function editClient(id){
  const client=byId(state.clients,id); if(!client) return;
  $("clientId").value=client.id; $("clientName").value=client.name||""; $("clientPhone").value=client.phone||""; $("clientSource").value=client.source||""; $("clientType").value=client.type||"Разовый"; $("clientNotes").value=client.notes||"";
  $("clientFormTitle").textContent="Редактирование клиента"; $("clientSaveBtn").textContent="Сохранить изменения"; $("clientCancelEditBtn").classList.remove("hidden");
  activateSection("clients");
}
function clearOperatorForm(){
  $("operatorId").value=""; $("operatorForm").reset(); $("operatorRate").value=0;
  $("operatorFormTitle").textContent="Добавить оператора"; $("operatorSaveBtn").textContent="Сохранить оператора"; $("operatorCancelEditBtn").classList.add("hidden");
}
function editOperator(id){
  const op=byId(state.operators,id); if(!op) return;
  $("operatorId").value=op.id; $("operatorName").value=op.name||""; $("operatorPhone").value=op.phone||""; $("operatorSkill").value=op.skill||""; $("operatorRate").value=op.rate||0;
  $("operatorFormTitle").textContent="Редактирование оператора"; $("operatorSaveBtn").textContent="Сохранить изменения"; $("operatorCancelEditBtn").classList.remove("hidden");
  activateSection("operators");
}
function clearOrderForm(){
  $("orderId").value=""; $("orderForm").reset(); $("orderStatus").value="new";
  $("orderFormTitle").textContent="Новая заявка"; $("orderSaveBtn").textContent="Сохранить заявку"; $("orderCancelEditBtn").classList.add("hidden");
}
function editOrder(id){
  const o=byId(state.orders,id); if(!o) return;
  $("orderId").value=o.id; $("orderClient").value=o.clientId||""; $("orderEquipment").value=o.equipmentId||""; $("orderOperator").value=o.operatorId||"";
  $("orderStart").value=o.startDate; $("orderEnd").value=o.endDate; $("orderLocation").value=o.location||""; $("orderRate").value=o.rate||0; $("orderStatus").value=o.status||"new"; $("orderNotes").value=o.notes||"";
  $("orderFormTitle").textContent="Редактирование заявки"; $("orderSaveBtn").textContent="Сохранить изменения"; $("orderCancelEditBtn").classList.remove("hidden");
  activateSection("orders");
}
function clearRepairForm(){
  $("repairId").value=""; $("repairForm").reset(); $("repairStatus").value="planned";
  $("repairFormTitle").textContent="Запланировать ремонт"; $("repairSaveBtn").textContent="Сохранить ремонт"; $("repairCancelEditBtn").classList.add("hidden");
}
function editRepair(id){
  const r=byId(state.repairs,id); if(!r) return;
  $("repairId").value=r.id; $("repairEquipment").value=r.equipmentId||""; $("repairStart").value=r.startDate; $("repairEnd").value=r.endDate; $("repairStatus").value=r.status||"planned"; $("repairTasks").value=r.tasks||""; $("repairNotes").value=r.notes||"";
  $("repairFormTitle").textContent="Редактирование ремонта"; $("repairSaveBtn").textContent="Сохранить изменения"; $("repairCancelEditBtn").classList.remove("hidden");
  activateSection("repairs");
}
function clearOperationForm(){
  $("operationId").value=""; $("operationForm").reset(); $("opType").value="income"; $("opCategory").value="Оплата клиента"; $("opOrder").value=""; $("opRepair").value="";
  $("opFormTitle").textContent="Новая финансовая операция"; $("opSaveBtn").textContent="Сохранить операцию"; $("opCancelEditBtn").classList.add("hidden");
}
function editOperation(id){
  const o=byId(state.operations,id); if(!o) return;
  $("operationId").value=o.id; $("opDate").value=o.date; $("opType").value=o.type; $("opCategory").value=o.category||"Прочее"; $("opAmount").value=o.amount; $("opOrder").value=o.orderId||""; $("opRepair").value=o.repairId||""; $("opComment").value=o.comment||"";
  $("opFormTitle").textContent="Редактирование операции"; $("opSaveBtn").textContent="Сохранить изменения"; $("opCancelEditBtn").classList.remove("hidden");
  activateSection("finance");
}
window.editEquipment = editEquipment; window.editClient = editClient; window.editOperator = editOperator; window.editOrder = editOrder; window.editRepair = editRepair; window.editOperation = editOperation;

function removeOrder(id){
  if(!confirm("Удалить заявку? Все привязанные к ней операции останутся, но связь будет снята.")) return;
  state.operations = state.operations.map(op => op.orderId===id ? {...op, orderId:""} : op);
  state.orders = state.orders.filter(o=>o.id!==id);
  clearOrderForm(); renderAll();
}
function removeRepair(id){
  if(!confirm("Удалить ремонт? Все привязанные к нему операции останутся, но связь будет снята.")) return;
  state.operations = state.operations.map(op => op.repairId===id ? {...op, repairId:""} : op);
  state.repairs = state.repairs.filter(r=>r.id!==id);
  clearRepairForm(); renderAll();
}
function removeOperation(id){ if(confirm("Удалить операцию?")){ state.operations=state.operations.filter(o=>o.id!==id); clearOperationForm(); renderAll(); } }
function removeClient(id){ if(confirm("Удалить клиента и связанные заявки?")){ const orderIds=state.orders.filter(o=>o.clientId===id).map(o=>o.id); state.operations=state.operations.map(op=>orderIds.includes(op.orderId)?{...op,orderId:""}:op); state.orders=state.orders.filter(o=>o.clientId!==id); state.clients=state.clients.filter(c=>c.id!==id); clearClientForm(); renderAll(); } }
function removeEquipment(id){
  if(!confirm("Удалить технику и связанные заявки/ремонты?")) return;
  const orderIds=state.orders.filter(o=>o.equipmentId===id).map(o=>o.id);
  const repairIds=state.repairs.filter(r=>r.equipmentId===id).map(r=>r.id);
  state.operations=state.operations.map(op=>({
    ...op,
    orderId: orderIds.includes(op.orderId) ? "" : op.orderId,
    repairId: repairIds.includes(op.repairId) ? "" : op.repairId
  }));
  state.orders=state.orders.filter(o=>o.equipmentId!==id);
  state.repairs=state.repairs.filter(r=>r.equipmentId!==id);
  state.equipment=state.equipment.filter(e=>e.id!==id);
  clearEquipmentForm(); renderAll();
}
function removeOperator(id){ if(confirm("Удалить оператора?")){ state.orders=state.orders.map(o=>o.operatorId===id?{...o,operatorId:""}:o); state.operators=state.operators.filter(o=>o.id!==id); clearOperatorForm(); renderAll(); } }
window.removeOrder=removeOrder; window.removeRepair=removeRepair; window.removeOperation=removeOperation; window.removeClient=removeClient; window.removeEquipment=removeEquipment; window.removeOperator=removeOperator;

function bindForms(){
  $("clientForm").addEventListener("submit",e=>{
    e.preventDefault();
    const id=$("clientId").value.trim();
    const payload={name:$("clientName").value.trim(),phone:$("clientPhone").value.trim(),source:$("clientSource").value.trim(),type:$("clientType").value,notes:$("clientNotes").value.trim()};
    if(id){ const idx=state.clients.findIndex(x=>x.id===id); if(idx>-1) state.clients[idx]={...state.clients[idx],...payload}; }
    else state.clients.push({id:uid("cl"),...payload});
    clearClientForm(); renderAll();
  });
  $("equipmentForm").addEventListener("submit",e=>{
    e.preventDefault();
    const id=$("equipmentId").value.trim();
    const payload={name:$("eqName").value.trim(),type:$("eqType").value.trim(),code:$("eqCode").value.trim(),defaultRate:Number($("eqRate").value||0),status:$("eqStatus").value};
    if(id){ const idx=state.equipment.findIndex(x=>x.id===id); if(idx>-1) state.equipment[idx]={...state.equipment[idx],...payload}; }
    else state.equipment.push({id:uid("eq"),...payload});
    clearEquipmentForm(); renderAll();
  });
  $("operatorForm").addEventListener("submit",e=>{
    e.preventDefault();
    const id=$("operatorId").value.trim();
    const payload={name:$("operatorName").value.trim(),phone:$("operatorPhone").value.trim(),skill:$("operatorSkill").value.trim(),rate:Number($("operatorRate").value||0)};
    if(id){ const idx=state.operators.findIndex(x=>x.id===id); if(idx>-1) state.operators[idx]={...state.operators[idx],...payload}; }
    else state.operators.push({id:uid("op"),...payload});
    clearOperatorForm(); renderAll();
  });
  $("orderEquipment").addEventListener("change",e=>{
    const eq=byId(state.equipment,e.target.value); if(eq && !$("orderRate").value) $("orderRate").value=eq.defaultRate||0;
  });
  $("orderForm").addEventListener("submit",e=>{
    e.preventDefault();
    const id=$("orderId").value.trim(), clientId=$("orderClient").value, equipmentId=$("orderEquipment").value, startDate=$("orderStart").value, endDate=$("orderEnd").value;
    if(!clientId||!equipmentId||!startDate||!endDate) return alert("Заполни клиента, технику и даты.");
    if(startDate > endDate) return alert("Дата окончания не может быть раньше даты начала.");
    const payload={clientId,equipmentId,operatorId:$("orderOperator").value,startDate,endDate,location:$("orderLocation").value.trim(),rate:Number($("orderRate").value||0),status:$("orderStatus").value,notes:$("orderNotes").value.trim()};
    if(id){ const idx=state.orders.findIndex(x=>x.id===id); if(idx>-1) state.orders[idx]={...state.orders[idx],...payload}; }
    else state.orders.push({id:uid("ord"),...payload});
    clearOrderForm(); renderAll();
  });
  $("orderCancelEditBtn").addEventListener("click", clearOrderForm);

  $("repairForm").addEventListener("submit",e=>{
    e.preventDefault();
    const id=$("repairId").value.trim(), equipmentId=$("repairEquipment").value, startDate=$("repairStart").value, endDate=$("repairEnd").value;
    if(!equipmentId || !startDate || !endDate) return alert("Заполни технику и даты ремонта.");
    if(startDate > endDate) return alert("Дата окончания не может быть раньше даты начала.");
    const payload={equipmentId,startDate,endDate,status:$("repairStatus").value,tasks:$("repairTasks").value.trim(),notes:$("repairNotes").value.trim()};
    if(id){ const idx=state.repairs.findIndex(x=>x.id===id); if(idx>-1) state.repairs[idx]={...state.repairs[idx],...payload}; }
    else state.repairs.push({id:uid("rep"),...payload});
    clearRepairForm(); renderAll();
  });
  $("repairCancelEditBtn").addEventListener("click", clearRepairForm);

  $("operationForm").addEventListener("submit",e=>{
    e.preventDefault();
    const id=$("operationId").value.trim(), date=$("opDate").value, type=$("opType").value, category=$("opCategory").value, amount=Number($("opAmount").value||0), orderId=$("opOrder").value, repairId=$("opRepair").value, comment=$("opComment").value.trim();
    if(!date || !amount) return alert("Заполни дату и сумму.");
    const payload={date,type,category,amount,orderId: repairId ? "" : orderId, repairId, comment};
    if(id){ const idx=state.operations.findIndex(x=>x.id===id); if(idx>-1) state.operations[idx]={...state.operations[idx],...payload}; }
    else state.operations.push({id:uid("fin"),...payload});
    clearOperationForm(); renderAll();
  });
  $("opCancelEditBtn").addEventListener("click", clearOperationForm);
  $("equipmentCancelEditBtn").addEventListener("click", clearEquipmentForm);
  $("clientCancelEditBtn").addEventListener("click", clearClientForm);
  $("operatorCancelEditBtn").addEventListener("click", clearOperatorForm);

  $("opOrder").addEventListener("change", ()=>{ if($("opOrder").value) $("opRepair").value=""; });
  $("opRepair").addEventListener("change", ()=>{ if($("opRepair").value) $("opOrder").value=""; });
}
function activateSection(sec){
  document.querySelectorAll(".section").forEach(x=>x.classList.remove("active"));
  const section = $("section-"+sec);
  if(section) section.classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(x=>x.classList.toggle("active", x.dataset.sec===sec));
  const map={
    auth:["Авторизация","Только вход в систему и управление доступом"],
    dashboard:["Дашборд","Контроль выручки, расходов, прибыли, ремонтов и загрузки"],
    orders:["Заявки","Создание и редактирование заявок по аренде"],
    repairs:["Ремонты","Планирование ремонта техники и резерв времени"],
    calendar:["Календарь","Месячный и линейный режимы календаря"],
    finance:["Финансы","Приходы, расходы и привязка к аренде или ремонту"],
    equipment:["Техника","Парк техники, статусы и ремонты"],
    clients:["Клиенты","Клиентская база и показатели"],
    operators:["Операторы","Люди, смены и начисления"],
    integrations:["Google Forms","Подключение и синхронизация заявок из Google Forms"],
    settings:["Настройки","Описание возможностей и сервисные функции"]
  };
  const page = map[sec] || map.dashboard;
  if($("pageTitle")) $("pageTitle").textContent = page[0];
  if($("pageSubtitle")) $("pageSubtitle").textContent = page[1];
}
function bindNav(){ document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>activateSection(b.dataset.sec))); }
function bindFilters(){
  $("orderSearch").addEventListener("input", renderOrders);
  $("orderFilterStatus").addEventListener("change", renderOrders);
  $("repairSearch").addEventListener("input", renderRepairs);
  $("repairFilterStatus").addEventListener("change", renderRepairs);
  $("opSearch").addEventListener("input", renderFinance);
  $("opFilterType").addEventListener("change", renderFinance);
}
function bindGeneral(){
  on("prevMonth","click",()=>{ state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth()-1, 1); renderCalendar(); save(); });
  on("nextMonth","click",()=>{ state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth()+1, 1); renderCalendar(); save(); });
  on("currentMonth","click",()=>{ state.calendarDate = new Date(); renderCalendar(); save(); });
  on("calendarMode","change",()=>{ state.calendarMode = $("calendarMode").value; renderCalendar(); save(); });
  on("chartMode","change",()=>{ state.chartMode = $("chartMode").value; renderDashboardChart(); save(); });

  on("resetBtn","click",()=>{ if(confirm("Удалить все данные CRM?")){ resetState(); clearOrderForm(); clearRepairForm(); clearOperationForm(); renderAll(); } });
  on("exportBtn","click",()=>{
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),clients:state.clients,equipment:state.equipment,operators:state.operators,orders:state.orders,operations:state.operations,repairs:state.repairs,chartMode:state.chartMode,calendarMode:state.calendarMode},null,2)],{type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="RBT_CRM_v41_export.json"; a.click(); URL.revokeObjectURL(a.href);
  });
  on("importFile","change",e=>{
    const file=e.target.files[0]; if(!file) return;
    const r=new FileReader(); r.onload=()=>{
      try{
        const data=JSON.parse(r.result);
        state.clients=Array.isArray(data.clients)?data.clients:[];
        state.equipment=Array.isArray(data.equipment)?data.equipment:[];
        state.operators=Array.isArray(data.operators)?data.operators:[];
        state.orders=Array.isArray(data.orders)?data.orders:[];
        state.operations=Array.isArray(data.operations)?data.operations:[];
        state.repairs=Array.isArray(data.repairs)?data.repairs:[];
        state.chartMode=data.chartMode||"bars";
        state.calendarMode=data.calendarMode||"month";
        state.integrations={
          googleFormsUrl: data.integrations?.googleFormsUrl || "",
          autoSync: Boolean(data.integrations?.autoSync),
          importedResponseIds: Array.isArray(data.integrations?.importedResponseIds) ? data.integrations.importedResponseIds : [],
          lastSyncAt: data.integrations?.lastSyncAt || "",
          lastSyncStatus: data.integrations?.lastSyncStatus || ""
        };
        clearOrderForm(); clearRepairForm(); clearOperationForm(); renderAll(); alert("Импорт выполнен.");
      }catch(err){ alert("Не удалось импортировать файл."); }
    }; r.readAsText(file); e.target.value="";
  });
  on("seedBtn","click",seedDemo);
  on("authForm","submit", async e => {
    e.preventDefault();
    if(!supabaseClient) return;
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    if(!email || !password) return;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if(error){
      renderAuthStatus("error", `Ошибка входа: ${error.message}`);
      return;
    }
    renderAuthStatus("ok", "Вход выполнен.");
  });
  on("authSignupBtn","click", async () => {
    if(!supabaseClient) return;
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    if(!email || !password) return alert("Заполни email и пароль.");
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if(error){
      renderAuthStatus("error", `Ошибка регистрации: ${error.message}`);
      return;
    }
    renderAuthStatus("ok", "Регистрация успешна. Проверь email, если включено подтверждение.");
  });
  on("authResetBtn","click", async () => {
    if(!supabaseClient) return;
    const email = $("authEmail").value.trim();
    if(!email) return alert("Укажи email для восстановления пароля.");
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if(error){
      renderAuthStatus("error", `Ошибка сброса пароля: ${error.message}`);
      return;
    }
    renderAuthStatus("ok", "Письмо для сброса пароля отправлено.");
  });
  on("authLogoutBtn","click", async () => {
    if(!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if(error){
      renderAuthStatus("error", `Ошибка выхода: ${error.message}`);
      return;
    }
    renderAuthStatus("ok", "Выход выполнен.");
  });
  on("integrationForm","submit",e=>{
    e.preventDefault();
    state.integrations.googleFormsUrl = $("integrationUrl").value.trim();
    state.integrations.autoSync = $("integrationAutoSync").checked;
    state.integrations.lastSyncStatus = "Настройки интеграции сохранены.";
    save();
    refreshIntegrationForm();
  });
  on("syncGoogleFormsBtn","click",()=>syncGoogleForms(true));
}
function seedDemo(){
  if(state.clients.length || state.orders.length || state.operations.length || state.repairs.length){ if(!confirm("Демо-данные добавятся к текущим. Продолжить?")) return; }
  const c1={id:uid("cl"),name:"ТОВ Будмонтаж",phone:"+380671112233",source:"Сайт",type:"Постоянный",notes:"Часто арендует экскаватор"};
  const c2={id:uid("cl"),name:"ФОП Коваленко",phone:"+380501234567",source:"OLX",type:"Разовый",notes:"Объекты по Киевской области"};
  const c3={id:uid("cl"),name:"RDS Construction",phone:"+380931234567",source:"Рекомендация",type:"Постоянный",notes:"Работают по безналу"};
  state.clients.push(c1,c2,c3);
  const e1={id:uid("eq"),name:"CAT 320",type:"Экскаватор",code:"EX-001",defaultRate:18000,status:"free"};
  const e2={id:uid("eq"),name:"XCMG QY25K",type:"Автокран",code:"CR-002",defaultRate:26000,status:"free"};
  const e3={id:uid("eq"),name:"MAN TGS",type:"Самосвал",code:"TR-003",defaultRate:15000,status:"free"};
  state.equipment.push(e1,e2,e3);
  const o1={id:uid("op"),name:"Иван Петренко",phone:"+380671234567",skill:"Экскаваторщик",rate:2500};
  const o2={id:uid("op"),name:"Сергей Бойко",phone:"+380501998877",skill:"Крановщик",rate:3000};
  state.operators.push(o1,o2);
  const base=new Date(); const d=n=>{ const x=new Date(base); x.setDate(x.getDate()+n); return x.toISOString().slice(0,10); };
  const ord1={id:uid("ord"),clientId:c1.id,equipmentId:e1.id,operatorId:o1.id,startDate:d(-3),endDate:d(2),location:"Киевская обл.",rate:18000,status:"active",notes:"Котлован"};
  const ord2={id:uid("ord"),clientId:c2.id,equipmentId:e2.id,operatorId:o2.id,startDate:d(4),endDate:d(6),location:"Бровары",rate:26000,status:"confirmed",notes:"Монтаж плит"};
  const ord3={id:uid("ord"),clientId:c3.id,equipmentId:e3.id,operatorId:"",startDate:d(1),endDate:d(4),location:"Вишнёвое",rate:15000,status:"new",notes:"Вывоз грунта"};
  const ord4={id:uid("ord"),clientId:c1.id,equipmentId:e1.id,operatorId:o1.id,startDate:d(1),endDate:d(5),location:"Ирпень",rate:18000,status:"confirmed",notes:"Конфликтный пример"};
  state.orders.push(ord1,ord2,ord3,ord4);
  const rep1={id:uid("rep"),equipmentId:e2.id,startDate:d(5),endDate:d(7),status:"planned",tasks:"Замена троса и проверка стрелы",notes:"Нужны запчасти"};
  const rep2={id:uid("rep"),equipmentId:e3.id,startDate:d(-1),endDate:d(1),status:"active",tasks:"ТО и замена масла",notes:"Сервис по месту"};
  state.repairs.push(rep1,rep2);
  state.operations.push(
    {id:uid("fin"),date:d(-2),type:"income",category:"Оплата клиента",amount:50000,orderId:ord1.id,repairId:"",comment:"Аванс"},
    {id:uid("fin"),date:d(-1),type:"expense",category:"Топливо",amount:7000,orderId:ord1.id,repairId:"",comment:"Заправка"},
    {id:uid("fin"),date:d(-1),type:"expense",category:"Зарплата оператора",amount:10000,orderId:ord1.id,repairId:"",comment:"Частичная выплата"},
    {id:uid("fin"),date:d(0),type:"income",category:"Оплата клиента",amount:30000,orderId:ord2.id,repairId:"",comment:"Предоплата"},
    {id:uid("fin"),date:d(1),type:"expense",category:"Логистика",amount:6000,orderId:ord2.id,repairId:"",comment:"Доставка крана"},
    {id:uid("fin"),date:d(5),type:"expense",category:"Запчасти",amount:12000,orderId:"",repairId:rep1.id,comment:"Трос и расходники"},
    {id:uid("fin"),date:d(0),type:"expense",category:"Ремонт",amount:4500,orderId:"",repairId:rep2.id,comment:"Сервисные работы"}
  );
  renderAll();
}
async function init(){
  bindNav(); bindForms(); bindFilters(); bindGeneral();
  $("chartMode").value = state.chartMode; $("calendarMode").value = state.calendarMode;
  clearEquipmentForm(); clearClientForm(); clearOperatorForm(); clearOrderForm(); clearRepairForm(); clearOperationForm(); renderAll(); refreshIntegrationForm(); setAppAccess(false);
  await initAuth();
  if(state.integrations.autoSync && state.integrations.googleFormsUrl) syncGoogleForms(false);
}
init();
