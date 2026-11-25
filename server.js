// Định biên & Ngân sách – BẢN LOCAL ĐỘC LẬP (không kết nối KOI, không cần API key)
// Dữ liệu nằm trong data/du-lieu.json trên máy. Luồng định biên mô phỏng trang
// "Tạo và xem Kế hoạch định biên" của KOI (module krf_hr_headcount_plan).
// Chạy: node server.js   (Node 18+; không cần cài thư viện)
const http = require('http');
const fs = require('fs');
const path = require('path');

process.on('uncaughtException', e => console.error('[LOI]', (e && e.stack) || e));
const BOOT = Date.now();
// Tự khởi động lại khi server.js được cập nhật (start.bat chạy lại ngay)
fs.watchFile(__filename, { interval: 1500 }, (c, p) => { if (c.mtimeMs !== p.mtimeMs) { console.log('[CAP NHAT] server.js thay doi - khoi dong lai'); process.exit(0); } });
const PORT = Number(process.env.PORT || 5180);
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DIR, 'du-lieu.json');
const SEED = path.join(__dirname, 'data', 'du-lieu-goc-tu-KOI.json');
const BUDGET = path.join(DIR, 'ngan-sach-cau-hinh.json');
const BAK = path.join(DIR, 'sao-luu');

// ---------- Kho dữ liệu ----------
fs.mkdirSync(BAK, { recursive: true });
const HOST = process.env.HOST || '127.0.0.1';
const PASS = process.env.APP_PASSWORD || '';
if (!fs.existsSync(FILE)) fs.copyFileSync(SEED, FILE);
// Mỗi lần khởi động (kể cả khi tự cập nhật) sao lưu dữ liệu đang có, giữ 30 bản gần nhất
try {
  const z = n => String(n).padStart(2, '0'), d = new Date();
  fs.copyFileSync(FILE, path.join(BAK, `khoi-dong-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.json`));
  fs.readdirSync(BAK).filter(f => f.startsWith('khoi-dong-')).sort().slice(0, -30).forEach(f => fs.unlinkSync(path.join(BAK, f)));
} catch (e) { console.error('[SAO LUU]', e.message); }
let DB = JSON.parse(fs.readFileSync(FILE, 'utf8'));
DB.comments = DB.comments || [];
// Cập nhật thông tin tham chiếu từ file gốc KOI (không đụng tới kế hoạch / ghi chú của người dùng)
try {
  const SEEDDB = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const sj = Object.fromEntries(SEEDDB.jobs.map(j => [j.id, j]));
  DB.jobs.forEach(j => { if (sj[j.id]) { j.current_hc = sj[j.id].current_hc; j.employees = sj[j.id].employees; } });
  DB.meta = { ...DB.meta, ...SEEDDB.meta };
} catch (e) { console.error('[GOC]', e.message); }
function save() {
  const day = new Date().toISOString().slice(0, 10);
  const bak = path.join(BAK, `du-lieu-${day}.json`);
  if (!fs.existsSync(bak) && fs.existsSync(FILE)) fs.copyFileSync(FILE, bak);
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(DB));
  fs.renameSync(tmp, FILE);
}
const nextId = k => DB.seq[k]++;
const now = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
let USER = process.env.DEFAULT_USER || 'Người dùng';
class UserError extends Error {}
const fail = m => { throw new UserError(m); };
function log(plan, text) { DB.log.push({ plan_code: plan.code, plan_id: plan.id, date: now(), author: USER, body: text }); }

// ---------- Tra cứu ----------
const dept = id => DB.departments.find(d => d.id === id);
const job = id => DB.jobs.find(j => j.id === id);
const plan = id => DB.plans.find(p => p.id === id) || fail('Không tìm thấy kế hoạch');
function childIds(id) { const out = [id]; for (let i = 0; i < out.length; i++) DB.departments.filter(d => d.parent_id === out[i]).forEach(d => out.push(d.id)); return out; }
const MONTHS = y => Array.from({ length: 12 }, (_, i) => ({ id: i, name: `Tháng ${String(i + 1).padStart(2, '0')}/${y}` }));
const seatLines = pid => DB.lines.filter(l => l.plan_id === pid && !l.base_line_id && l.plan_status !== 'removed');
function currentHc(l) { return l.planned_hc + DB.lines.filter(a => a.base_line_id === l.id && a.plan_status === 'in_plan').reduce((s, a) => s + a.planned_hc, 0); }
const RANK = { validate: 0, confirm: 1, draft: 2, refuse: 3, cancel: 4 };
const ST = { draft: 'Nháp', confirm: 'Chờ phê duyệt', validate: 'Đã phê duyệt', refuse: 'Từ chối', cancel: 'Đã huỷ' };
function vld(j, hc) { if (j.controlled && hc < j.employees) fail(`${j.name}: định biên ${hc} thấp hơn ${j.employees} người đang giữ (VLD-HC-05). Tăng định biên hoặc bỏ "Kiểm soát vị trí".`); }

// ---------- Lưới ----------
function grid(deptId, scenarioId, year, planId) {
  const root = dept(deptId) || fail('Không tìm thấy đơn vị');
  const ids = childIds(deptId);
  const plans = DB.plans.filter(p => p.scope_id === deptId && p.scenario_id === scenarioId && p.year === year)
    .sort((a, b) => (RANK[a.status] - RANK[b.status]) || (b.version - a.version));
  const p = planId ? plans.find(x => x.id === planId) : plans[0];
  const lines = p ? seatLines(p.id) : [];
  const jobs = DB.jobs.filter(j => ids.includes(j.dept_id) || lines.some(l => l.job_id === j.id));
  const cm = new Date().getFullYear() === year ? new Date().getMonth() : null;
  const ref = refMonth(year);
  const rows = jobs.map(j => {
    const cells = Array(12).fill(null);
    lines.filter(l => l.job_id === j.id).forEach(l => {
      cells[l.month] = { line_id: l.id, hc: p.status === 'validate' ? currentHc(l) : l.planned_hc, status: l.plan_status,
        pending: DB.adjustments.some(a => a.line_id === l.id && a.status === 'confirm') };
    });
    // Ngoài định biên: có người nhưng không có định biên hiệu lực tháng hiện tại trong kế hoạch đã duyệt
    const nowLine = cm != null ? DB.lines.find(l => l.job_id === j.id && !l.base_line_id && l.month === cm && l.plan_status === 'in_plan' && DB.plans.some(x => x.id === l.plan_id && x.status === 'validate' && x.year === year)) : null;
    return { job_id: j.id, name: j.name, dept_id: j.dept_id, controlled: j.controlled, is_new: !!(j.new_plan_id || j.created_local),
      unplanned: cm != null && j.employees > 0 && !(nowLine && currentHc(nowLine) > 0),
      employees: Array(j.employees).fill({ name: '' }), employee_count: j.employees, current_hc: j.current_hc ?? null, requests: [], cells };
  });
  const adjustments = p ? DB.adjustments.filter(a => a.plan_id === p.id).sort((a, b) => b.id - a.id).map(a => ({
    ...a, position_id: [a.job_id, (job(a.job_id) || {}).name], period_id: [a.month, `Tháng ${String(a.month + 1).padStart(2, '0')}/${year}`],
    requester_id: [0, a.requester], create_date: a.create_date })) : [];
  return {
    root: { id: deptId, name: root.full, company_id: root.company_id },
    periods: MONTHS(year), depts: DB.departments.filter(d => ids.includes(d.id)).sort((a, b) => a.full.localeCompare(b.full)),
    plan: p ? view(p) : null, plans: plans.map(x => ({ id: x.id, code: x.code, version: x.version, status: x.status, name: x.name })),
    rows, adjustments, current_month: cm, ref_month: ref, current_hc_month: (DB.meta && DB.meta.current_hc_month) || '',
    notes: p ? (p.notes || {}) : {},
    comments: p ? DB.comments.filter(c => c.plan_code === p.code).slice().reverse() : [],
  };
}
// Tháng tham chiếu: tháng chứa hôm nay; trước kỳ = tháng đầu; sau kỳ = tháng cuối
function refMonth(year) { const n = new Date(); return n.getFullYear() === year ? n.getMonth() : (n.getFullYear() < year ? 0 : 11); }
// Định biên hiệu lực của vị trí trong 1 tháng: dòng in_plan của kế hoạch Đã duyệt năm đó (gồm điều chỉnh)
function inForce(jobId, year, m) {
  const l = DB.lines.find(l => l.job_id === jobId && l.month === m && !l.base_line_id && l.plan_status === 'in_plan' && DB.plans.some(p => p.id === l.plan_id && p.status === 'validate' && p.year === year));
  return l ? currentHc(l) : null;
}
function rootOf(id) { let d = dept(id); while (d && d.parent_id && dept(d.parent_id)) d = dept(d.parent_id); return d; }

// ---------- Dashboard hoạch định nhân sự ----------
function dashboard(companyId, scenarioId, year) {
  const ref = refMonth(year);
  const jobs = DB.jobs.filter(j => j.company_id === companyId);
  const units = {};
  for (const j of jobs) {
    const r = rootOf(j.dept_id) || { id: 0, full: '(Chưa gán đơn vị)' };
    const u = units[r.id] = units[r.id] || { dept_id: r.id, name: r.full, jobs: 0, planned: 0, occupied: 0, vacant: 0, over: 0, months: Array(12).fill(0) };
    u.jobs++; u.occupied += j.employees;
    const hc = inForce(j.id, year, ref) || 0;
    u.planned += hc; u.vacant += Math.max(0, hc - j.employees); u.over += Math.max(0, j.employees - hc);
    for (let m = 0; m < 12; m++) u.months[m] += inForce(j.id, year, m) || 0;
  }
  const out = Object.values(units).map(u => {
    const ps = DB.plans.filter(p => p.scope_id === u.dept_id && p.year === year && p.scenario_id === scenarioId).sort((a, b) => (RANK[a.status] - RANK[b.status]) || (b.version - a.version));
    return { ...u, coverage: u.planned ? Math.round(Math.min(u.occupied, u.planned) / u.planned * 100) : 0, plan: ps[0] ? { id: ps[0].id, code: ps[0].code, status: ps[0].status, version: ps[0].version } : null };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const unplanned = jobs.filter(j => j.employees > 0 && !(inForce(j.id, year, ref) > 0))
    .map(j => ({ job_id: j.id, name: j.name, dept: (dept(j.dept_id) || {}).full || '(Chưa gán đơn vị)', employees: j.employees, controlled: j.controlled }));
  return { ref_month: ref, units: out, unplanned };
}
function pending() {
  const plans = DB.plans.filter(p => p.status === 'confirm').map(p => ({ id: p.id, code: p.code, name: p.name, version: p.version, scope_id: p.scope_id, scenario_id: p.scenario_id, year: p.year, company_id: p.company_id }));
  const adj = {};
  DB.adjustments.filter(a => a.status === 'confirm').forEach(a => { const p = plan(a.plan_id); adj[p.id] = adj[p.id] || { plan_id: p.id, code: p.code, scope_id: p.scope_id, scenario_id: p.scenario_id, year: p.year, company_id: p.company_id, count: 0 }; adj[p.id].count++; });
  return { plans, adjustments: Object.values(adj) };
}
function view(p) { return { ...p, scenario_id: [p.scenario_id, (DB.scenarios.find(s => s.id === p.scenario_id) || {}).name], owner_id: [0, p.owner] }; }

// ---------- Kế hoạch ----------
function createPlan({ dept_id, scenario_id, year }) {
  const d = dept(dept_id) || fail('Không tìm thấy đơn vị');
  if (DB.plans.some(p => p.scope_id === dept_id && p.scenario_id === scenario_id && p.year === year && ['draft', 'confirm', 'validate'].includes(p.status)))
    fail('Đơn vị này đã có kế hoạch cho kịch bản và năm này');
  const comp = DB.companies.find(c => c.id === d.company_id) || { code: 'C' };
  let code = `KHDB-${comp.code}-${d.id}-${String(year).slice(2)}01`, n = 2;
  while (DB.plans.some(p => p.code === code)) code = `KHDB-${comp.code}-${d.id}-${String(year).slice(2)}01-${n++}`;
  const p = { id: nextId('plan'), code, version: 1, status: 'draft', name: `Định biên - ${d.name} - 01/01/${year} - 31/12/${year}`,
    company_id: d.company_id, scope_id: dept_id, scenario_id, year, owner: USER, create_date: now(), approval_date: null };
  DB.plans.push(p); log(p, 'Tạo kế hoạch (Nháp)'); save();
  return { id: p.id };
}
function setCells(p, cells) {
  let ok = 0; const errors = [];
  for (const c of cells) {
    const hc = Math.max(0, Math.round(Number(c.hc) || 0));
    try {
      const j = job(c.job_id) || fail('Không tìm thấy vị trí');
      const l = c.line_id ? DB.lines.find(x => x.id === c.line_id) : DB.lines.find(x => x.plan_id === p.id && x.job_id === j.id && x.month === c.month && !x.base_line_id);
      if (hc > 0) vld(j, hc);
      if (l) { l.planned_hc = hc; l.plan_status = hc === 0 ? 'out_of_plan' : 'in_plan'; }
      else if (hc > 0) DB.lines.push({ id: nextId('line'), plan_id: p.id, job_id: j.id, dept_id: j.dept_id, month: c.month, planned_hc: hc, plan_status: 'in_plan', line_type: 'original', base_line_id: null });
      ok++;
    } catch (e) { if (!(e instanceof UserError)) throw e; errors.push({ job_id: c.job_id, month: c.month, error: e.message }); }
  }
  return { ok, errors };
}
function saveGrid({ plan_id, cells }) {
  const p = plan(plan_id);
  if (p.status !== 'draft') fail('Chỉ lưu bảng được khi kế hoạch đang Nháp. Kế hoạch đã duyệt thì dùng "Tạo điều chỉnh".');
  const r = setCells(p, cells);
  if (r.ok) log(p, `Lưu bảng: ${r.ok} ô`);
  save(); return r;
}
function transfer({ plan_id, from_job, to_job, months, qty, reason, cells, submit }) {
  if (!reason) fail('Điều chuyển bắt buộc có lý do');
  const p = plan(plan_id);
  if (p.status === 'validate') return transferAdj(p, from_job, to_job, months, qty, reason, submit);
  if (p.status !== 'draft') fail('Điều chuyển chỉ làm được trên kế hoạch Nháp hoặc Đã phê duyệt');
  const r = setCells(p, cells);
  log(p, `Điều chuyển ${qty} định biên tháng ${months.map(m => m + 1).join(', ')} từ "${job(from_job).name}" sang "${job(to_job).name}". Lý do: ${reason}`);
  save(); return r;
}
function conflicts(p) {
  const mine = seatLines(p.id).filter(l => l.plan_status === 'in_plan' && l.planned_hc > 0);
  for (const l of mine) {
    const other = DB.lines.find(o => o.job_id === l.job_id && o.month === l.month && !o.base_line_id && o.plan_status === 'in_plan' && o.plan_id !== p.id &&
      DB.plans.some(x => x.id === o.plan_id && x.status === 'validate' && x.year === p.year && x.code !== p.code));
    if (other) { const op = plan(other.plan_id); fail(`${job(l.job_id).name} đã có định biên được duyệt tháng ${l.month + 1}/${p.year} trong kế hoạch ${op.code}`); }
  }
}
function planAction({ plan_id, method, reason }) {
  const p = plan(plan_id);
  const need = (...s) => { if (!s.includes(p.status)) fail(`Kế hoạch đang "${ST[p.status]}" – không làm được bước này`); };
  let newId = null;
  if (method === 'action_submit') {
    need('draft');
    if (!seatLines(p.id).some(l => l.plan_status === 'in_plan')) fail('Kế hoạch chưa có dòng định biên nào');
    conflicts(p); p.status = 'confirm'; log(p, 'Gửi phê duyệt');
  } else if (method === 'action_approve') {
    need('confirm'); conflicts(p);
    if (DB.plans.some(x => x.code === p.code && x.version > p.version)) fail('Chỉ duyệt được phiên bản mới nhất');
    p.status = 'validate'; p.approval_date = now();
    DB.plans.filter(x => x.code === p.code && x.id !== p.id && x.status === 'validate').forEach(x => { x.status = 'cancel'; cancelAdj(x.id); log(x, `Huỷ do phiên bản ${p.version} được duyệt`); });
    log(p, 'Đã phê duyệt');
  } else if (method === 'action_reject') {
    need('confirm'); p.status = 'refuse'; log(p, 'Từ chối' + (reason ? `: ${reason}` : ''));
  } else if (method === 'action_cancel') {
    need('draft', 'confirm', 'validate'); p.status = 'cancel'; cancelAdj(p.id); log(p, 'Huỷ kế hoạch');
  } else if (method === 'action_reset_draft') {
    need('refuse', 'cancel');
    if (DB.plans.some(x => x.code === p.code && x.version > p.version)) fail('Chỉ đặt lại được phiên bản mới nhất');
    p.status = 'draft'; log(p, 'Đặt lại về Nháp');
  } else if (method === 'action_create_new_version') {
    need('validate');
    if (DB.plans.some(x => x.code === p.code && x.version > p.version)) fail('Đã có phiên bản mới hơn');
    const v = Math.max(...DB.plans.filter(x => x.code === p.code).map(x => x.version)) + 1;
    const np = { ...p, notes: { ...(p.notes || {}) }, id: nextId('plan'), version: v, status: 'draft', approval_date: null, create_date: now(), owner: USER };
    DB.plans.push(np);
    seatLines(p.id).forEach(l => DB.lines.push({ id: nextId('line'), plan_id: np.id, job_id: l.job_id, dept_id: l.dept_id, month: l.month, planned_hc: currentHc(l), plan_status: l.plan_status, line_type: 'original', base_line_id: null }));
    log(np, `Tạo phiên bản ${v} từ phiên bản ${p.version}`); newId = np.id;
  } else fail('Thao tác không hợp lệ');
  save(); return { ok: true, new_plan_id: newId };
}
function transferAdj(p, a, b, months, qty, reason, submit) {
  const ref = `T${Date.now()}`; const made = [];
  for (const m of months) {
    const src = DB.lines.find(l => l.plan_id === p.id && l.job_id === a && l.month === m && !l.base_line_id && l.plan_status !== 'removed');
    if (!src || currentHc(src) < qty) fail(`${job(a).name} tháng ${m + 1} không đủ ${qty} định biên để chuyển`);
    const dst = DB.lines.find(l => l.plan_id === p.id && l.job_id === b && l.month === m && !l.base_line_id && l.plan_status !== 'removed');
    const mk = (jid, line, cur, to, act) => { const id = nextId('adj'); const x = { id, code: `ADJ-${p.year}-${String(id).padStart(4, '0')}`, plan_id: p.id, job_id: jid, month: m, line_id: line ? line.id : null, action: act, current_planned_hc: cur, target_planned_hc: to, change_qty: to - cur, reason, requester: USER, status: 'draft', transfer_ref: ref, create_date: now() }; DB.adjustments.push(x); made.push(x); };
    const sc = currentHc(src); mk(a, src, sc, sc - qty, sc - qty === 0 ? 'remove' : 'resize');
    const dc = dst ? currentHc(dst) : 0; mk(b, dst, dc, dc + qty, dst ? 'resize' : 'add');
  }
  log(p, `Điều chuyển ${qty} định biên tháng ${months.map(m => m + 1).join(', ')} từ "${job(a).name}" sang "${job(b).name}" (cặp phiếu ${ref}). Lý do: ${reason}`);
  if (submit) made.forEach(x => (x.status = 'confirm'));
  save(); return { ok: made.length, errors: [], adjustments: made.length };
}
function cancelAdj(pid) { DB.adjustments.filter(a => a.plan_id === pid && ['draft', 'confirm'].includes(a.status)).forEach(a => (a.status = 'cancel')); }

// ---------- Điều chỉnh ----------
function createAdjustments({ plan_id, changes, reason, submit }) {
  const p = plan(plan_id);
  if (p.status !== 'validate') fail('Chỉ tạo điều chỉnh trên kế hoạch Đã phê duyệt');
  const batch = `B${Date.now()}`; const created = []; const errors = [];
  for (const c of changes) {
    const to = Math.max(0, Math.round(Number(c.to) || 0));
    try {
      const j = job(c.job_id);
      const l = c.line_id ? DB.lines.find(x => x.id === c.line_id) : null;
      const cur = l ? currentHc(l) : 0;
      if (l && to === cur) continue;
      if (!l && to === 0) continue;
      const aid = nextId('adj');
      const a = { id: aid, code: `ADJ-${p.year}-${String(aid).padStart(4, '0')}`, plan_id: p.id, job_id: j.id, month: c.month, line_id: l ? l.id : null,
        action: l ? (to === 0 ? 'remove' : 'resize') : 'add', current_planned_hc: cur, target_planned_hc: to, change_qty: to - cur,
        reason: reason || 'Điều chỉnh định biên', requester: USER, status: 'draft', batch_ref: batch, create_date: now() };
      DB.adjustments.push(a); created.push(a);
    } catch (e) { errors.push({ job_id: c.job_id, month: c.month, error: e.message }); }
  }
  if (created.length) log(p, `Tạo ${created.length} điều chỉnh (Nháp)`);
  let submitted = 0;
  if (submit) for (const a of created) { try { adjStep(a, 'action_submit'); submitted++; } catch (e) { errors.push({ job_id: a.job_id, month: a.month, error: e.message }); } }
  save(); return { created: created.length, submitted, errors };
}
function adjStep(a, method) {
  const j = job(a.job_id); const p = plan(a.plan_id);
  const need = (...s) => { if (!s.includes(a.status)) fail(`${a.code} đang "${ST[a.status]}"`); };
  if (method === 'action_submit') { need('draft'); if (a.action !== 'add') vld({ ...j, controlled: true }, a.target_planned_hc); a.status = 'confirm'; }
  else if (method === 'action_approve') {
    need('confirm');
    if (a.action === 'add') {
      if (DB.lines.some(l => l.plan_id === p.id && l.job_id === a.job_id && l.month === a.month && !l.base_line_id && l.plan_status !== 'removed')) fail(`${j.name} tháng ${a.month + 1} đã có dòng – dùng Tăng/giảm thay vì Thêm`);
      DB.lines.push({ id: nextId('line'), plan_id: p.id, job_id: a.job_id, dept_id: j.dept_id, month: a.month, planned_hc: a.target_planned_hc, plan_status: 'in_plan', line_type: 'adjustment', base_line_id: null, adjustment_id: a.id });
    } else {
      const l = DB.lines.find(x => x.id === a.line_id); const cur = currentHc(l);
      if (a.target_planned_hc < j.employees) fail(`${j.name}: không thể thấp hơn ${j.employees} người đang giữ`);
      DB.lines.push({ id: nextId('line'), plan_id: p.id, job_id: a.job_id, dept_id: j.dept_id, month: a.month, planned_hc: a.target_planned_hc - cur, plan_status: 'in_plan', line_type: 'adjustment', base_line_id: l.id, adjustment_id: a.id });
      a.previous_planned_hc = cur;
    }
    a.status = 'validate'; a.decision_date = now(); log(p, `Duyệt ${a.code}: ${j.name} T${a.month + 1} → ${a.target_planned_hc}`);
  } else if (method === 'action_reject') { need('confirm'); a.status = 'refuse'; }
  else if (method === 'action_cancel') { need('draft', 'confirm'); a.status = 'cancel'; }
  else if (method === 'action_reset_draft') { need('refuse', 'cancel'); a.status = 'draft'; }
  else fail('Thao tác không hợp lệ');
}
function adjustmentAction({ method, ids }) {
  const set = new Set(ids);
  DB.adjustments.filter(a => set.has(a.id) && a.transfer_ref).forEach(a => DB.adjustments.filter(x => x.transfer_ref === a.transfer_ref).forEach(x => set.add(x.id)));
  const groups = {};
  for (const id of set) { const a = DB.adjustments.find(x => x.id === id); const k = a.transfer_ref || `#${a.id}`; (groups[k] = groups[k] || []).push(a); }
  const errors = [];
  for (const g of Object.values(groups)) {
    const snap = JSON.stringify({ l: DB.lines, a: DB.adjustments, s: DB.seq, g: DB.log });
    try { g.forEach(a => adjStep(a, method)); }
    catch (e) { const r = JSON.parse(snap); DB.lines = r.l; DB.adjustments = r.a; DB.seq = r.s; DB.log = r.g; errors.push(e.message + (g.length > 1 ? ' (cả cặp điều chuyển không được áp dụng)' : '')); }
  }
  save(); if (errors.length) fail(errors.join(' · ')); return { ok: true };
}

// ---------- Vị trí mới ----------
function newPosition({ name, dept_id, plan_id, note }) {
  if (!name) fail('Nhập tên vị trí');
  const d = dept(dept_id) || fail('Không tìm thấy đơn vị');
  const j = { id: nextId('job'), company_id: d.company_id, dept_id, name, employees: 0, controlled: true, new_plan_id: plan_id || null, created_local: true };
  DB.jobs.push(j);
  if (plan_id) { const p = plan(plan_id); if (note) { p.notes = p.notes || {}; p.notes[j.id] = note; } log(p, `Tạo vị trí mới "${name}" tại ${d.name}${note ? `. Lý do: ${note}` : ''}`); }
  save(); return { id: j.id };
}

function movePosition({ job_id, dept_id, plan_id }) {
  const j = job(job_id) || fail('Không tìm thấy vị trí'); const d = dept(dept_id) || fail('Không tìm thấy đơn vị');
  if (!j.created_local) fail('Chỉ đổi phòng ban được với vị trí tạo trong app. Vị trí lấy từ KOI phải chuyển bằng phiếu điều chỉnh trên KOI.');
  if (DB.lines.some(l => l.job_id === j.id && DB.plans.some(p => p.id === l.plan_id && ['confirm', 'validate'].includes(p.status))))
    fail('Vị trí đã nằm trong kế hoạch Chờ duyệt / Đã duyệt – không đổi phòng ban trực tiếp được');
  const old = dept(j.dept_id); j.dept_id = d.id; DB.lines.filter(l => l.job_id === j.id).forEach(l => (l.dept_id = d.id));
  if (plan_id) log(plan(plan_id), `Đổi phòng ban vị trí "${j.name}": ${old ? old.name : '?'} → ${d.name}`);
  save(); return { ok: true };
}
function setNote({ plan_id, job_id, text }) {
  const p = plan(plan_id); const j = job(job_id) || fail('Không tìm thấy vị trí');
  if (['confirm'].includes(p.status)) fail('Kế hoạch đang chờ duyệt – không sửa ghi chú được');
  p.notes = p.notes || {}; const t = (text || '').trim();
  if (t) p.notes[job_id] = t; else delete p.notes[job_id];
  log(p, t ? `Ghi chú "${j.name}": ${t}` : `Xoá ghi chú "${j.name}"`); save(); return { ok: true };
}
function addComment({ plan_id, body }) {
  const p = plan(plan_id); const t = (body || '').trim(); if (!t) fail('Nhập nội dung trao đổi');
  DB.comments.push({ id: Date.now(), plan_code: p.code, plan_id: p.id, version: p.version, date: now(), author: USER, body: t });
  save(); return { ok: true };
}
function history(planId) {
  const p = plan(planId);
  const versions = DB.plans.filter(x => x.code === p.code).sort((a, b) => b.version - a.version)
    .map(x => ({ id: x.id, version: x.version, name: x.name, status: x.status, create_uid: [0, x.owner], create_date: x.create_date, approval_date: x.approval_date }));
  const messages = DB.log.filter(m => m.plan_code === p.code).slice().reverse().map(m => ({ date: m.date, author: m.author, body: `${m.body}${m.plan_id !== p.id ? ` <span style="color:#888">(v${(DB.plans.find(x => x.id === m.plan_id) || {}).version})</span>` : ''}` }));
  return { versions, messages };
}

// ---------- HTTP ----------
const routes = {
  'GET /api/version': () => { const f = path.join(__dirname, 'public', 'index.html'); return { boot: BOOT, page: fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0 }; },
  'GET /api/me': () => ({ name: USER, mode: 'local', snapshot: DB.meta && DB.meta.snapshot, source: DB.meta && DB.meta.source }),
  'GET /api/companies': () => DB.companies,
  'GET /api/departments': q => DB.departments.filter(d => d.company_id === Number(q.company_id) && d.id !== 0).sort((a, b) => a.full.localeCompare(b.full)).map(d => ({ id: d.id, complete_name: d.full })),
  'GET /api/scenarios': () => DB.scenarios,
  'GET /api/grid': q => grid(Number(q.dept_id), Number(q.scenario_id), Number(q.year), q.plan_id ? Number(q.plan_id) : null),
  'POST /api/plan/create': (q, b) => createPlan(b),
  'POST /api/plan/save': (q, b) => saveGrid(b),
  'POST /api/plan/action': (q, b) => planAction(b),
  'POST /api/plan/transfer': (q, b) => transfer(b),
  'POST /api/position': (q, b) => newPosition(b),
  'POST /api/adjustments': (q, b) => createAdjustments(b),
  'POST /api/adjustment/action': (q, b) => adjustmentAction(b),
  'GET /api/history': q => history(Number(q.plan_id)),
  'POST /api/plan/note': (q, b) => setNote(b),
  'POST /api/position/move': (q, b) => movePosition(b),
  'POST /api/plan/comment': (q, b) => addComment(b),
  'GET /api/dashboard': q => dashboard(Number(q.company_id), Number(q.scenario_id), Number(q.year)),
  'GET /api/pending': () => pending(),
  'GET /api/budget': () => (fs.existsSync(BUDGET) ? JSON.parse(fs.readFileSync(BUDGET, 'utf8')) : null),
  'POST /api/budget': (q, b) => { if (!b || typeof b !== 'object') fail('Cấu hình không hợp lệ'); if (fs.existsSync(BUDGET)) fs.copyFileSync(BUDGET, path.join(BAK, `ngan-sach-${new Date().toISOString().slice(0, 10)}.json`)); fs.writeFileSync(BUDGET, JSON.stringify(b)); return { ok: true }; },
  'GET /api/data': () => DB,
  'POST /api/data': (q, b) => {
    if (!b || !Array.isArray(b.departments) || !Array.isArray(b.jobs) || !Array.isArray(b.plans)) fail('File không đúng định dạng dữ liệu của app');
    save(); fs.copyFileSync(FILE, path.join(BAK, `truoc-khoi-phuc-${Date.now()}.json`));
    DB = b; save(); return { ok: true };
  },
};

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function body(req) { return new Promise((ok, no) => { let s = ''; req.on('data', c => (s += c)); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } }); }); }

http.createServer(async (req, res) => {
  if (PASS) { const h = req.headers.authorization || ''; const pw = h.startsWith('Basic ') ? Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':') : ''; if (pw !== PASS) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Dinh bien", charset="UTF-8"' }); return res.end('Can mat khau'); } }
  const url = new URL(req.url, 'http://x');
  try { USER = req.headers['x-user'] ? decodeURIComponent(req.headers['x-user']).slice(0, 60) : (process.env.DEFAULT_USER || 'Người dùng'); } catch (e) { USER = 'Người dùng'; }
  const key = `${req.method} ${url.pathname}`;
  if (routes[key]) {
    try { send(res, 200, await routes[key](Object.fromEntries(url.searchParams), req.method === 'POST' ? await body(req) : {})); }
    catch (e) { if (!(e instanceof UserError)) console.error('[API]', key, e.stack || e.message); send(res, 500, { error: e.message }); }
    return;
  }
  const pub = path.join(__dirname, 'public');
  const file = path.join(pub, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!file.startsWith(pub) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).on('error', e => {
  if (e.code === 'EADDRINUSE') { console.error(`[LOI] Cong ${PORT} dang bi chiem - thu lai sau 3 giay`); setTimeout(() => process.exit(3), 3000); }
  else console.error('[LOI]', e.message);
}).listen(PORT, HOST, () => console.log(`[OK] Dinh bien (local doc lap) dang chay: http://localhost:${PORT} (${process.version})`));
