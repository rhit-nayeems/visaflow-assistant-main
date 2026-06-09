/**
 * Generates portfolio assets for VisaFlow into public/projects/visaflow/.
 *
 *   node scripts/generate-portfolio-assets.mjs
 *
 * SVGs are written directly; PNGs are rendered from SVG via `sharp` at high density.
 * Diagrams are authored from real code paths (src/server/cases, src/lib/cases,
 * supabase/migrations) and the real `node --test` output (62 passing).
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "public/projects/visaflow";
mkdirSync(OUT, { recursive: true });

const DENSITY = 160; // ~2.2x raster scale for crisp PNGs

const C = {
  bg0: "#0a0f1c", bg1: "#0f172a",
  card: "#16213a", card2: "#1c2942", panel: "#111a2e",
  border: "#334155", borderSoft: "#283449",
  text: "#e2e8f0", muted: "#94a3b8", faint: "#64748b",
  indigo: "#6366f1", violet: "#8b5cf6", emerald: "#10b981",
  amber: "#f59e0b", rose: "#f43f5e", blue: "#38bdf8", slate: "#64748b",
  green: "#22c55e", cyan: "#22d3ee",
};
const FONT = "Segoe UI, Helvetica, Arial, sans-serif";
const MONO = "Consolas, 'DejaVu Sans Mono', Menlo, monospace";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nm = (c) => c.replace("#", "");

// ---- shared fragments -------------------------------------------------------
const ARROW_COLORS = [C.muted, C.indigo, C.violet, C.emerald, C.amber, C.rose, C.blue, C.slate, C.faint];

function defs(extra = "") {
  const markers = ARROW_COLORS.map(
    (c) => `<marker id="arr-${nm(c)}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`
  ).join("");
  return `<defs>
    <linearGradient id="bgg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg0}"/>
    </linearGradient>
    ${markers}${extra}
  </defs>`;
}

function header(title, subtitle, x = 48, y = 56) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="29" font-weight="800" fill="${C.text}">${esc(title)}</text>
    <text x="${x}" y="${y + 30}" font-family="${FONT}" font-size="15.5" fill="${C.muted}">${esc(subtitle)}</text>`;
}

function caption(W, H, left, right) {
  return `<rect x="0" y="${H - 36}" width="${W}" height="36" fill="${C.bg0}"/>
    <line x1="0" y1="${H - 36}" x2="${W}" y2="${H - 36}" stroke="${C.borderSoft}"/>
    <text x="28" y="${H - 13}" font-family="${FONT}" font-size="13" fill="${C.faint}">${esc(left)}</text>
    <text x="${W - 28}" y="${H - 13}" font-family="${MONO}" font-size="13" fill="${C.indigo}" text-anchor="end">${esc(right)}</text>`;
}

function edge(d, color, { label, dash, width = 2.4, lx, ly } = {}) {
  let s = `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""} marker-end="url(#arr-${nm(color)})"/>`;
  if (label) s += edgeLabel(lx, ly, label, color);
  return s;
}
function edgeLabel(x, y, text, color = C.muted) {
  const w = text.length * 6.7 + 16;
  return `<g><rect x="${x - w / 2}" y="${y - 12}" width="${w}" height="22" rx="6" fill="${C.bg0}" stroke="${C.borderSoft}"/>
    <text x="${x}" y="${y + 3.5}" font-family="${FONT}" font-size="12" fill="${color === C.muted ? C.muted : color}" text-anchor="middle">${esc(text)}</text></g>`;
}
function pill(x, y, text, color, { anchor = "start" } = {}) {
  const w = text.length * 6.6 + 20;
  const rx = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
  return `<g><rect x="${rx}" y="${y}" width="${w}" height="22" rx="11" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-opacity="0.55"/>
    <text x="${rx + w / 2}" y="${y + 15}" font-family="${FONT}" font-size="11.5" fill="${color}" text-anchor="middle">${esc(text)}</text></g>`;
}

function statusNode(x, y, label, accent, { w = 200, h = 56 } = {}) {
  const cy = y + h / 2;
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="13" fill="${C.card}" stroke="${accent}" stroke-width="2"/>
    <circle cx="${x + 22}" cy="${cy}" r="6" fill="${accent}"/>
    <text x="${x + 40}" y="${cy + 5}" font-family="${MONO}" font-size="14" fill="${C.text}" font-weight="600">${esc(label)}</text>
  </g>`;
}

function renderSvg(name, svg) {
  writeFileSync(`${OUT}/${name}`, svg);
  console.log("wrote", `${OUT}/${name}`);
}
async function renderPng(name, svg) {
  await sharp(Buffer.from(svg), { density: DENSITY }).png().toFile(`${OUT}/${name}`);
  const m = await sharp(`${OUT}/${name}`).metadata();
  console.log("wrote", `${OUT}/${name}`, `${m.width}x${m.height}`);
}

// =============================================================================
// 1. requirements-engine.svg  —  10-status case lifecycle
// =============================================================================
function requirementsEngine() {
  const W = 1280, H = 820;
  let g = "";
  // section labels
  g += pill(48, 132, "1 · Student build + deterministic evaluation", C.blue);
  g += pill(540, 268, "2 · Reviewer decision", C.indigo);

  // Row 1 (build pipeline)
  const r1y = 170;
  const r1 = [
    [48, "draft", C.slate],
    [294, "missing_documents", C.amber],
    [540, "in_progress", C.blue],
    [786, "blocked", C.rose],
    [1032, "ready_for_submission", C.emerald],
  ];
  r1.forEach(([x, l, c]) => (g += statusNode(x, r1y, l, c)));
  const r1labels = ["upload", "extract", "blocker found", "resolved"];
  for (let i = 0; i < 4; i++) {
    const x1 = r1[i][0] + 200, x2 = r1[i + 1][0];
    g += edge(`M${x1},${r1y + 28} L${x2},${r1y + 28}`, C.muted, { label: r1labels[i], lx: (x1 + x2) / 2, ly: r1y + 28 });
  }

  // Row 1 -> submitted (down)
  const subY = 392;
  g += statusNode(1032, subY, "submitted", C.indigo);
  g += edge(`M1132,${r1y + 56} L1132,${subY}`, C.muted, { label: "submit for review", lx: 1132, ly: (r1y + 56 + subY) / 2 });

  // Outcomes column
  const ax = 540;
  const aprY = 312, chgY = 432, denY = 552;
  g += statusNode(240, aprY, "completed", C.emerald);
  g += statusNode(ax, aprY, "approved", C.emerald);
  g += statusNode(ax, chgY, "change_pending", C.amber);
  g += statusNode(ax, denY, "denied", C.rose);

  // submitted branches
  g += edge(`M1032,${subY + 28} C 900,${subY + 28} 820,${aprY + 28} ${ax + 200},${aprY + 28}`, C.indigo, { label: "approve", lx: 880, ly: aprY + 6 });
  g += edge(`M1032,${subY + 28} C 900,${subY + 28} 840,${chgY + 28} ${ax + 200},${chgY + 28}`, C.indigo, { label: "request changes", lx: 895, ly: chgY + 34 });
  g += edge(`M1032,${subY + 28} C 900,${subY + 60} 820,${denY + 28} ${ax + 200},${denY + 28}`, C.indigo, { label: "deny", lx: 880, ly: denY + 6 });

  // approved -> completed
  g += edge(`M${ax},${aprY + 28} L${240 + 200},${aprY + 28}`, C.emerald, { label: "finalize", lx: (ax + 440) / 2, ly: aprY + 28 });

  // HIGHLIGHT: approved -> change_pending (re-review loop)
  g += `<rect x="${ax - 14}" y="${aprY - 8}" width="228" height="${chgY - aprY + 72}" rx="16" fill="${C.violet}" fill-opacity="0.06" stroke="${C.violet}" stroke-opacity="0.4" stroke-dasharray="5 5"/>`;
  g += edge(`M${ax + 100},${aprY + 56} L${ax + 100},${chgY}`, C.violet, { width: 3.4, label: "re-review ★", lx: ax + 100, ly: (aprY + 56 + chgY) / 2, });

  // change_pending -> submitted (resubmit loop)
  g += edge(`M${ax + 200},${chgY + 40} C 880,${chgY + 150} 1000,${chgY + 150} 1132,${subY + 56}`, C.amber, { dash: "6 5", label: "resubmit", lx: 920, ly: chgY + 150 });

  // legend
  const ly = 700;
  const leg = [
    ["draft", C.slate], ["in progress", C.blue], ["needs action", C.amber],
    ["blocked / denied", C.rose], ["ready / approved", C.emerald], ["in review", C.indigo], ["re-review ★", C.violet],
  ];
  let lx = 48;
  leg.forEach(([t, c]) => {
    g += `<circle cx="${lx + 6}" cy="${ly}" r="6" fill="${c}"/><text x="${lx + 20}" y="${ly + 5}" font-family="${FONT}" font-size="13" fill="${C.muted}">${esc(t)}</text>`;
    lx += 26 + t.length * 7.6 + 26;
  });
  g += `<text x="48" y="${ly + 32}" font-family="${FONT}" font-size="12.5" fill="${C.faint}">★ approved → change_pending: an approved case reopens when approval-sensitive fields (employer, location, dates) change. Transitions validated server-side against CASE_STATUS_TRANSITIONS.</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${defs()}<rect width="${W}" height="${H}" fill="url(#bgg)"/>
    ${header("Case requirements engine — 10-status lifecycle", "Deterministic status derivation · server-enforced, atomic transitions")}
    ${g}
    ${caption(W, H, "VisaFlow · src/lib/cases/{requirements,status}.ts", "visaflow-requirements-engine")}
  </svg>`;
  return svg;
}

// =============================================================================
// 2. runtime-architecture.svg
// =============================================================================
function runtimeArchitecture() {
  const W = 1320, H = 720;
  let g = "";

  function bigCard(x, y, w, h, { title, accent, lines = [], tag }) {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${C.card}" stroke="${C.border}" stroke-width="1.5"/>`;
    s += `<rect x="${x}" y="${y + 14}" width="4" height="${h - 28}" rx="2" fill="${accent}"/>`;
    s += `<text x="${x + 22}" y="${y + 34}" font-family="${FONT}" font-size="17" font-weight="700" fill="${C.text}">${esc(title)}</text>`;
    lines.forEach((ln, i) => (s += `<text x="${x + 22}" y="${y + 60 + i * 22}" font-family="${FONT}" font-size="13.5" fill="${C.muted}">${esc(ln)}</text>`));
    if (tag) s += pill(x + w - 14, y + 14, tag, accent, { anchor: "end" });
    return s;
  }
  function container(x, y, w, h, label, color) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.65"/>
      <text x="${x + 18}" y="${y + 23}" font-family="${FONT}" font-size="13" font-weight="700" fill="${color}" opacity="0.95">${esc(label)}</text>`;
  }

  // containers
  g += container(296, 176, 488, 252, "Cloudflare Workers · nodejs_compat", C.violet);
  g += container(776, 176, 508, 252, "Supabase (managed)", C.emerald);

  const cy = 305, ch = 150, cardY = 230;
  g += bigCard(40, cardY, 236, ch, { title: "TanStack Start", accent: C.indigo, tag: "browser", lines: ["React 19 · SSR + SPA", "TanStack Router", "TanStack Query"] });
  g += bigCard(312, cardY, 216, ch, { title: "Server functions", accent: C.violet, lines: ["createServerFn (POST)", "dynamic-import", "workflow modules"] });
  g += bigCard(552, cardY, 216, ch, { title: "Auth middleware", accent: C.blue, lines: ["verify Bearer JWT", "auth.getClaims(token)", "inject {supabase,userId}"] });
  g += bigCard(792, cardY, 200, ch, { title: "Supabase client", accent: C.emerald, lines: ["user-scoped JWT", "RLS on every query"] });

  // data stack
  g += bigCard(1020, cardY, 264, 70, { title: "Postgres", accent: C.amber, lines: ["RLS policies + atomic RPCs"] });
  g += bigCard(1020, cardY + 82, 264, 68, { title: "Storage", accent: C.slate, lines: ["bucket: case-documents"] });

  // flow arrows
  g += edge(`M276,${cy} L312,${cy}`, C.muted, { label: "Bearer access_token", lx: 294, ly: cy - 18, width: 2.6 });
  g += edge(`M528,${cy} L552,${cy}`, C.muted, { label: ".middleware([…])", lx: 540, ly: cy - 18 });
  g += edge(`M768,${cy} L792,${cy}`, C.muted, { label: "auth ctx", lx: 780, ly: cy - 18 });
  g += edge(`M992,${cy - 10} L1020,${cardY + 35}`, C.emerald, { label: "SQL · RLS", lx: 1006, ly: cardY + 8 });
  g += edge(`M992,${cy + 18} L1020,${cardY + 116}`, C.slate, { label: "download", lx: 1006, ly: cardY + 138 });

  // supabase auth (session/roles)
  const authY = 470;
  g += bigCard(792, authY, 200, 70, { title: "Supabase Auth", accent: C.cyan, lines: ["sessions · roles · claims"] });
  g += edge(`M158,${cardY + ch} C 158,${authY + 80} 640,${authY + 110} 792,${authY + 40}`, C.cyan, { dash: "6 5", label: "session + roles (VITE_SUPABASE_*)", lx: 470, ly: authY + 96 });
  g += edge(`M660,${cardY + ch} C 660,${authY} 760,${authY + 10} 838,${authY}`, C.blue, { dash: "6 5", label: "getClaims", lx: 740, ly: authY - 6 });

  // env note
  g += `<text x="40" y="${H - 60}" font-family="${MONO}" font-size="12.5" fill="${C.faint}">env: client → VITE_SUPABASE_*  ·  server → SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY  ·  admin (RLS-bypass, server-only) → SUPABASE_SERVICE_ROLE_KEY</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${defs()}<rect width="${W}" height="${H}" fill="url(#bgg)"/>
    ${header("Runtime architecture", "Request path: browser → Cloudflare Workers → auth middleware → Supabase (RLS) + Storage")}
    ${g}
    ${caption(W, H, "VisaFlow · TanStack Start on Cloudflare Workers + Supabase", "visaflow-runtime-architecture")}
  </svg>`;
  return svg;
}

// =============================================================================
// 3. reviewer-queue.png  —  admin review queue mock (tenant-scoped)
// =============================================================================
function reviewerQueue() {
  const W = 1280, H = 800;
  const SB = 232;
  let g = "";

  // background + sidebar
  g += `<rect width="${W}" height="${H}" fill="${C.bg0}"/>`;
  g += `<rect x="0" y="0" width="${SB}" height="${H}" fill="${C.panel}"/><line x1="${SB}" y1="0" x2="${SB}" y2="${H}" stroke="${C.borderSoft}"/>`;
  g += `<circle cx="34" cy="40" r="11" fill="${C.indigo}"/><text x="54" y="46" font-family="${FONT}" font-size="19" font-weight="800" fill="${C.text}">VisaFlow</text>`;
  const nav = [["Dashboard", false], ["My cases", false], ["Review queue", true], ["Schools", false], ["Settings", false]];
  nav.forEach(([t, active], i) => {
    const y = 96 + i * 46;
    if (active) g += `<rect x="12" y="${y - 24}" width="${SB - 24}" height="38" rx="9" fill="${C.indigo}" fill-opacity="0.16"/><rect x="12" y="${y - 24}" width="3" height="38" rx="2" fill="${C.indigo}"/>`;
    g += `<text x="30" y="${y}" font-family="${FONT}" font-size="14.5" fill="${active ? C.text : C.muted}" font-weight="${active ? 700 : 500}">${esc(t)}</text>`;
  });
  g += `<line x1="16" y1="${H - 96}" x2="${SB - 16}" y2="${H - 96}" stroke="${C.borderSoft}"/>`;
  g += `<circle cx="38" cy="${H - 56}" r="16" fill="${C.violet}" fill-opacity="0.3" stroke="${C.violet}"/><text x="38" y="${H - 51}" font-family="${FONT}" font-size="13" fill="${C.text}" text-anchor="middle" font-weight="700">DO</text>`;
  g += `<text x="62" y="${H - 60}" font-family="${FONT}" font-size="13.5" fill="${C.text}" font-weight="600">Dana Okafor</text>`;
  g += `<text x="62" y="${H - 42}" font-family="${MONO}" font-size="11.5" fill="${C.faint}">role: school_admin</text>`;

  // top bar
  const MX = SB + 32;
  g += `<text x="${MX}" y="52" font-family="${FONT}" font-size="24" font-weight="800" fill="${C.text}">Review queue</text>`;
  g += `<text x="${MX}" y="78" font-family="${FONT}" font-size="14" fill="${C.muted}">Submitted CPT cases awaiting your decision</text>`;
  g += `<rect x="${W - 250}" y="30" width="180" height="36" rx="10" fill="${C.card}" stroke="${C.border}"/><text x="${W - 234}" y="53" font-family="${FONT}" font-size="13" fill="${C.faint}">Search cases…</text>`;
  g += `<circle cx="${W - 44}" cy="48" r="18" fill="${C.card}" stroke="${C.border}"/><text x="${W - 44}" y="53" font-family="${FONT}" font-size="15" text-anchor="middle" fill="${C.muted}">⌕</text>`;

  // scope banner
  const by = 104;
  g += `<rect x="${MX}" y="${by}" width="${W - MX - 32}" height="74" rx="12" fill="${C.emerald}" fill-opacity="0.07" stroke="${C.emerald}" stroke-opacity="0.5"/>`;
  g += `<text x="${MX + 20}" y="${by + 28}" font-family="${FONT}" font-size="14.5" font-weight="700" fill="${C.emerald}">🔒 Scoped to your assigned schools</text>`;
  g += `<text x="${MX + 20}" y="${by + 52}" font-family="${MONO}" font-size="12.5" fill="${C.muted}">reviewer_school_assignments → server filter → Postgres RLS (can_review_case)</text>`;
  g += pill(W - 250, by + 18, "Northwood University", C.emerald);
  g += pill(W - 250, by + 44, "Lakeside College", C.emerald);

  // table
  const ty = 200, rowH = 70, tx = MX, tw = W - MX - 32;
  const cols = [
    ["Student", tx + 20], ["Employer", tx + 168], ["Role", tx + 330],
    ["Start date", tx + 512], ["School", tx + 648], ["Status", tx + 812],
  ];
  g += `<rect x="${tx}" y="${ty}" width="${tw}" height="44" rx="10" fill="${C.card2}"/>`;
  cols.forEach(([t, x]) => (g += `<text x="${x}" y="${ty + 28}" font-family="${FONT}" font-size="12.5" font-weight="700" fill="${C.faint}" letter-spacing="0.5">${esc(t.toUpperCase())}</text>`));
  const rows = [
    ["A. Sharma", "Cloudgrid Inc.", "SW Engineer Intern", "Jun 15, 2026", "Northwood University"],
    ["M. Chen", "Brightlytics", "Data Analyst", "Jul 01, 2026", "Lakeside College"],
    ["L. Okonkwo", "Northstar Robotics", "ML Engineer", "Jun 22, 2026", "Northwood University"],
    ["R. Patel", "Vertex Health", "Product Analyst", "Aug 03, 2026", "Lakeside College"],
    ["S. Kim", "Orbital Pay", "Backend Intern", "Jul 14, 2026", "Northwood University"],
    ["J. Alvarez", "Finch & Co.", "UX Researcher", "Sep 01, 2026", "Lakeside College"],
  ];
  rows.forEach((r, i) => {
    const y = ty + 44 + i * rowH;
    if (i % 2 === 1) g += `<rect x="${tx}" y="${y}" width="${tw}" height="${rowH}" fill="${C.card}" fill-opacity="0.4"/>`;
    g += `<line x1="${tx}" y1="${y + rowH}" x2="${tx + tw}" y2="${y + rowH}" stroke="${C.borderSoft}" stroke-opacity="0.6"/>`;
    const ry = y + rowH / 2 + 5;
    g += `<text x="${cols[0][1]}" y="${ry}" font-family="${FONT}" font-size="14" font-weight="600" fill="${C.text}">${esc(r[0])}</text>`;
    g += `<text x="${cols[1][1]}" y="${ry}" font-family="${FONT}" font-size="13.5" fill="${C.muted}">${esc(r[1])}</text>`;
    g += `<text x="${cols[2][1]}" y="${ry}" font-family="${FONT}" font-size="13.5" fill="${C.muted}">${esc(r[2])}</text>`;
    g += `<text x="${cols[3][1]}" y="${ry}" font-family="${MONO}" font-size="13" fill="${C.muted}">${esc(r[3])}</text>`;
    g += `<text x="${cols[4][1]}" y="${ry}" font-family="${FONT}" font-size="13.5" fill="${C.muted}">${esc(r[4])}</text>`;
    g += pill(cols[5][1], y + rowH / 2 - 11, "Submitted", C.indigo);
    g += `<text x="${tx + tw - 16}" y="${ry}" font-family="${FONT}" font-size="13.5" font-weight="600" fill="${C.blue}" text-anchor="end">Review →</text>`;
  });

  // annotation callout
  const cax = tx + 690, cay = ty + 44 + rows.length * rowH + 22;
  g += `<rect x="${tx}" y="${cay}" width="${tw}" height="58" rx="10" fill="${C.card}" stroke="${C.borderSoft}"/>`;
  g += `<text x="${tx + 18}" y="${cay + 24}" font-family="${FONT}" font-size="13" font-weight="700" fill="${C.amber}">Tenant isolation</text>`;
  g += `<text x="${tx + 18}" y="${cay + 44}" font-family="${FONT}" font-size="12.5" fill="${C.muted}">Cases from non-assigned schools never reach the queue — filtered by reviewer_school_assignments and re-checked by RLS. 6 of 6 rows belong to the two assigned schools.</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${defs()}${g}
    ${caption(W, H, "VisaFlow · reviewer / school-admin queue", "visaflow-reviewer-portal-rls")}
  </svg>`;
  return svg;
}

// =============================================================================
// 4. apply-reviewer-decision-rpc.png  —  annotated SQL
// =============================================================================
function rpcCode() {
  const W = 1180, H = 980;
  const lines = [
    "CREATE OR REPLACE FUNCTION public.apply_reviewer_case_decision(",
    "  p_case_id          UUID,",
    "  p_next_status      public.case_status,",
    "  p_reviewer_comment TEXT",
    ") RETURNS TABLE (case_id UUID, previous_status case_status, next_status case_status)",
    "LANGUAGE plpgsql",
    "SECURITY DEFINER",
    "SET search_path = public",
    "AS $$",
    "DECLARE",
    "  reviewer_user_id   UUID := auth.uid();",
    "  normalized_comment TEXT := NULLIF(BTRIM(COALESCE(p_reviewer_comment,'')),'');",
    "BEGIN",
    "  IF reviewer_user_id IS NULL",
    "     OR NOT public.has_role(reviewer_user_id,'school_admin') THEN",
    "    RAISE EXCEPTION 'Reviewer access requires the school_admin role.';",
    "  END IF;",
    "  IF p_next_status NOT IN ('approved','denied','change_pending') THEN",
    "    RAISE EXCEPTION 'Reviewer decisions can only transition ...';",
    "  END IF;",
    "  IF p_next_status IN ('denied','change_pending')",
    "     AND normalized_comment IS NULL THEN",
    "    RAISE EXCEPTION 'Reviewer comment is required.';",
    "  END IF;",
    "  UPDATE public.cases",
    "     SET status = p_next_status",
    "   WHERE id = p_case_id",
    "     AND status = 'submitted'",
    "     AND public.can_review_case(reviewer_user_id, cases.id);",
    "  IF FOUND THEN",
    "    INSERT INTO public.case_timeline_events",
    "      (case_id, event_type, title, description)",
    "    VALUES (p_case_id,'status_changed', timeline_title, timeline_description);",
    "    INSERT INTO public.audit_logs",
    "      (case_id, actor_id, action_type, field_name, old_value, new_value, reason)",
    "    VALUES (p_case_id, reviewer_user_id, audit_action_type,",
    "            'status','submitted', p_next_status, audit_reason);",
    "    RETURN QUERY SELECT p_case_id,'submitted', p_next_status;",
    "    RETURN;",
    "  END IF;",
    "  RAISE EXCEPTION 'Only submitted cases can be reviewed.';",
    "END; $$;",
  ];

  const KW = new Set("CREATE OR REPLACE FUNCTION RETURNS TABLE LANGUAGE SECURITY DEFINER SET AS DECLARE BEGIN END IF THEN NOT IN AND IS NULL UPDATE WHERE INSERT INTO VALUES RETURN QUERY SELECT RAISE EXCEPTION FOUND".split(" "));
  const FUNCS = new Set(["uid", "has_role", "can_review_case", "nullif", "btrim", "coalesce"]);
  const TYPES = new Set(["uuid", "text", "case_status", "plpgsql"]);
  const FAINT = new Set(["public", "auth", "cases"]);

  function hl(line) {
    if (line.trimStart().startsWith("--")) return [{ t: line, c: C.slate, i: true }];
    const out = [];
    const re = /('(?:[^']|'')*')|(\s+)|([A-Za-z_][A-Za-z0-9_]*)|([^\sA-Za-z0-9_']+)/g;
    let m;
    while ((m = re.exec(line))) {
      if (m[1]) out.push({ t: m[1], c: C.amber });
      else if (m[2]) out.push({ t: m[2], c: C.text });
      else if (m[3]) {
        const w = m[3], u = w.toUpperCase(), l = w.toLowerCase();
        let c = C.text;
        if (KW.has(u) && w === u) c = C.violet;
        else if (FUNCS.has(l)) c = C.blue;
        else if (TYPES.has(l)) c = C.emerald;
        else if (FAINT.has(l)) c = C.faint;
        out.push({ t: w, c });
      } else if (m[4]) out.push({ t: m[4], c: C.faint });
    }
    return out;
  }

  const winX = 40, winY = 44, winW = 760;
  const barH = 40, codeTop = winY + barH + 22, lineH = 19.6, gutter = 46;
  const winH = barH + 22 + lines.length * lineH + 16;
  let g = "";
  // window
  g += `<rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" rx="12" fill="${C.panel}" stroke="${C.border}" stroke-width="1.5"/>`;
  g += `<path d="M${winX},${winY + 12} a12,12 0 0 1 12,-12 h${winW - 24} a12,12 0 0 1 12,12 v${barH - 12} h-${winW} z" fill="${C.card2}"/>`;
  g += `<circle cx="${winX + 20}" cy="${winY + 20}" r="6" fill="#ff5f56"/><circle cx="${winX + 40}" cy="${winY + 20}" r="6" fill="#ffbd2e"/><circle cx="${winX + 60}" cy="${winY + 20}" r="6" fill="#27c93f"/>`;
  g += `<text x="${winX + 86}" y="${winY + 25}" font-family="${MONO}" font-size="12.5" fill="${C.muted}">supabase/migrations/…scope_reviewers… · apply_reviewer_case_decision()</text>`;
  // code
  lines.forEach((ln, i) => {
    const y = codeTop + i * lineH;
    g += `<text x="${winX + gutter - 10}" y="${y}" font-family="${MONO}" font-size="12" fill="${C.faint}" text-anchor="end">${i + 1}</text>`;
    let ts = "";
    hl(ln).forEach((tok) => (ts += `<tspan fill="${tok.c}"${tok.i ? ' font-style="italic"' : ""}>${esc(tok.t)}</tspan>`));
    g += `<text x="${winX + gutter}" y="${y}" font-family="${MONO}" font-size="13" xml:space="preserve">${ts}</text>`;
  });

  // annotations
  const annX = winX + winW + 28, annW = W - annX - 28;
  const yOf = (idx) => codeTop + idx * lineH - 4;
  const anns = [
    [6, "SECURITY DEFINER", "Runs with the function owner's rights so the write path is centralized; search_path is pinned to public to block injection.", C.violet],
    [18, "Allowed targets only", "Hard-fails anything except approved / denied / change_pending — reviewers cannot push arbitrary statuses.", C.indigo],
    [22, "Comment required", "deny and change_pending must carry a reviewer comment (normalized, non-empty).", C.amber],
    [28, "Authorization at write time", "The status update only matches when can_review_case() passes — role + school assignment — and the case is still 'submitted'.", C.emerald],
    [35, "One atomic transaction", "Status change + timeline event + audit log are written together; partial decisions are impossible.", C.blue],
    [38, "Canonical result", "Returns {previous_status, next_status} so the server verifies the DB-owned outcome.", C.cyan],
  ];
  anns.forEach(([idx, title, body, color], k) => {
    const ay = winY + 6 + k * ((winH - 20) / anns.length);
    const ah = (winH - 20) / anns.length - 14;
    g += `<rect x="${annX}" y="${ay}" width="${annW}" height="${ah}" rx="10" fill="${C.card}" stroke="${color}" stroke-opacity="0.5"/>`;
    g += `<rect x="${annX}" y="${ay + 12}" width="4" height="${ah - 24}" rx="2" fill="${color}"/>`;
    g += `<text x="${annX + 18}" y="${ay + 26}" font-family="${FONT}" font-size="13.5" font-weight="700" fill="${color}">${esc(title)}</text>`;
    g += wrapText(body, annX + 18, ay + 46, annW - 34, 17, C.muted, 12.5);
    // connector
    const ty2 = yOf(idx) - 4;
    g += `<path d="M${annX},${ay + ah / 2} C ${annX - 16},${ay + ah / 2} ${winX + winW + 14},${ty2} ${winX + winW},${ty2}" fill="none" stroke="${color}" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.7"/>`;
    g += `<circle cx="${winX + winW}" cy="${ty2}" r="3" fill="${color}"/>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${defs()}<rect width="${W}" height="${H}" fill="url(#bgg)"/>
    <text x="40" y="30" font-family="${FONT}" font-size="16" font-weight="700" fill="${C.text}">Atomic, security-defining reviewer decision RPC</text>
    ${g}
    ${caption(W, H, "VisaFlow · reviewer writes restricted to one DB RPC", "visaflow-atomic-rpcs")}
  </svg>`;
  return svg;
}

function wrapText(text, x, y, maxW, lh, color, size) {
  const words = text.split(" ");
  const cpl = Math.floor(maxW / (size * 0.52));
  let line = "", out = "", row = 0;
  for (const w of words) {
    if ((line + " " + w).trim().length > cpl) {
      out += `<text x="${x}" y="${y + row * lh}" font-family="${FONT}" font-size="${size}" fill="${color}">${esc(line.trim())}</text>`;
      line = w; row++;
    } else line += " " + w;
  }
  if (line.trim()) out += `<text x="${x}" y="${y + row * lh}" font-family="${FONT}" font-size="${size}" fill="${color}">${esc(line.trim())}</text>`;
  return out;
}

// =============================================================================
// 5. document-extraction-state.png
// =============================================================================
function extractionState() {
  const W = 1280, H = 760;
  let g = "";

  // ---- left: state machine ----
  g += `<text x="48" y="120" font-family="${FONT}" font-size="16" font-weight="700" fill="${C.text}">Extraction lifecycle (per document version)</text>`;
  const sn = (x, y, label, accent) => {
    const w = 158, h = 52, cy = y + h / 2;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.card}" stroke="${accent}" stroke-width="2"/>
      <circle cx="${x + 20}" cy="${cy}" r="5.5" fill="${accent}"/>
      <text x="${x + 36}" y="${cy + 5}" font-family="${MONO}" font-size="13.5" fill="${C.text}" font-weight="600">${esc(label)}</text>`;
  };
  const pend = [48, 320], proc = [300, 320], succ = [560, 200], fail = [560, 440];
  g += sn(...pend, "pending", C.slate);
  g += sn(...proc, "processing", C.blue);
  g += sn(...succ, "succeeded", C.emerald);
  g += sn(...fail, "failed", C.rose);

  g += edge(`M206,346 L300,346`, C.muted, { label: "extract starts", lx: 250, ly: 332 });
  g += edge(`M458,332 C 520,316 540,250 560,236`, C.emerald, { label: "fields stored", lx: 545, ly: 300 });
  g += edge(`M458,360 C 520,400 540,452 560,466`, C.rose, { label: "unreadable / error", lx: 548, ly: 420 });
  g += edge(`M560,486 C 470,540 360,512 379,372`, C.amber, { dash: "6 5", label: "retry", lx: 430, ly: 520 });
  // self-loop stale
  g += edge(`M345,320 C 335,266 425,266 415,320`, C.amber, { dash: "5 5" });
  g += edgeLabel(380, 258, "stale > 10 min → retry", C.amber);
  // manual correction highlight (failed -> succeeded)
  g += `<rect x="${succ[0] - 12}" y="${succ[1] - 10}" width="182" height="${fail[1] - succ[1] + 72}" rx="14" fill="${C.violet}" fill-opacity="0.06" stroke="${C.violet}" stroke-opacity="0.4" stroke-dasharray="5 5"/>`;
  g += edge(`M${succ[0] + 79},${fail[1]} L${succ[0] + 79},${succ[1] + 52}`, C.violet, { width: 3.2, label: "manual correction ★", lx: succ[0] + 79, ly: (fail[1] + succ[1] + 52) / 2 });

  g += `<text x="48" y="690" font-family="${FONT}" font-size="12.5" fill="${C.faint}">★ Editing a blocker-level extracted field on the latest relevant version repairs extraction_status and re-runs the requirements engine — one atomic RPC.</text>`;

  // ---- right: UI panel ----
  const px = 740, pw = 500;
  g += `<rect x="${px}" y="96" width="${pw}" height="560" rx="14" fill="${C.panel}" stroke="${C.border}"/>`;
  g += `<text x="${px + 24}" y="${134}" font-family="${FONT}" font-size="16" font-weight="700" fill="${C.text}">Case documents</text>`;
  const docs = [
    ["Offer letter", "v2 · 6 fields extracted", "Succeeded", C.emerald, "✔"],
    ["Advisor approval", "extracting…", "Processing", C.blue, "◴"],
    ["Course registration", "unreadable file", "Failed", C.rose, "✕"],
    ["I-20", "queued", "Pending", C.slate, "•"],
  ];
  docs.forEach((d, i) => {
    const y = 158 + i * 70;
    g += `<rect x="${px + 16}" y="${y}" width="${pw - 32}" height="58" rx="10" fill="${C.card}" stroke="${C.borderSoft}"/>`;
    g += `<text x="${px + 32}" y="${y + 24}" font-family="${FONT}" font-size="14" font-weight="600" fill="${C.text}">${esc(d[0])}</text>`;
    g += `<text x="${px + 32}" y="${y + 44}" font-family="${MONO}" font-size="11.5" fill="${C.faint}">${esc(d[1])}</text>`;
    g += pill(px + pw - 130, y + 10, d[2], d[3]);
    if (d[2] === "Failed") g += `<rect x="${px + pw - 130}" y="${y + 32}" width="60" height="20" rx="6" fill="${C.amber}" fill-opacity="0.16" stroke="${C.amber}"/><text x="${px + pw - 100}" y="${y + 46}" font-family="${FONT}" font-size="11" fill="${C.amber}" text-anchor="middle">Retry</text>`;
  });

  // manual correction editor
  const ey = 158 + 4 * 70 + 8;
  g += `<rect x="${px + 16}" y="${ey}" width="${pw - 32}" height="150" rx="10" fill="${C.violet}" fill-opacity="0.06" stroke="${C.violet}" stroke-opacity="0.45"/>`;
  g += `<text x="${px + 32}" y="${ey + 26}" font-family="${FONT}" font-size="13.5" font-weight="700" fill="${C.violet}">Manual correction · job_duties</text>`;
  g += `<rect x="${px + 32}" y="${ey + 38}" width="${pw - 64}" height="48" rx="8" fill="${C.bg0}" stroke="${C.border}"/>`;
  g += `<text x="${px + 44}" y="${ey + 67}" font-family="${FONT}" font-size="12.5" fill="${C.text}">Design and test data pipelines under faculty supervision…</text>`;
  g += `<rect x="${px + 32}" y="${ey + 98}" width="92" height="32" rx="8" fill="${C.indigo}"/><text x="${px + 78}" y="${ey + 119}" font-family="${FONT}" font-size="13" fill="#fff" text-anchor="middle" font-weight="600">Save</text>`;
  g += `<text x="${px + 138}" y="${ey + 119}" font-family="${MONO}" font-size="11.5" fill="${C.faint}">sets manually_corrected = true · repairs status</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${defs()}<rect width="${W}" height="${H}" fill="url(#bgg)"/>
    ${header("Document extraction lifecycle", "Stub extractor · states, stale-retry, and manual correction → re-evaluation")}
    ${g}
    ${caption(W, H, "VisaFlow · src/lib/cases/document-extraction-state.ts", "visaflow-document-lifecycle")}
  </svg>`;
  return svg;
}

// =============================================================================
// 6. test-coverage.png  —  terminal (real `node --test` output, 62 passing)
// =============================================================================
function testCoverage() {
  const groups = [
    ["src/lib/auth-redirect.test.ts", 7, ["buildAuthCallbackUrl defaults to the dashboard callback path", "sanitizeAuthNextPath rejects external redirect targets", "resolvePostAuthPath prefers recovery when the flow type is recovery"]],
    ["src/integrations/supabase/url.test.ts", 3, ["normalizeSupabaseUrl strips the PostgREST suffix", "normalizeSupabaseUrl trims whitespace and trailing slashes"]],
    ["src/server/cases/database-errors.test.ts", 12, ["maps missing RPC errors to an actionable migration message", "treats missing document extraction columns as schema drift", "preserves non-schema-drift database messages"]],
    ["src/server/cases/document-extraction.test.ts", 2, ["local stub extraction normalizes supported text-pattern fields", "local stub extraction fails clearly when the file has no supported text"]],
    ["src/server/cases/document-registration.test.ts", 4, ["retry with the same uploadRegistrationId returns the same document", "document registration delegates version allocation to the DB RPC"]],
    ["src/server/cases/reviewer-read.server.test.ts", 2, ["reviewer assigned to school A only sees school A submitted cases", "reviewer detail returns scoped read-side data for assigned cases"]],
    ["src/server/cases/workflows.server.test.ts", 32, ["submission moves a ready case into submitted and records history", "manual extracted-field save rolls back primary state when persistence fails", "reviewer decisions reject school admins not assigned to the case school"]],
  ];
  const summary = [["tests", "62", C.text], ["suites", "0", C.muted], ["pass", "62", C.green], ["fail", "0", C.green], ["cancelled", "0", C.muted], ["skipped", "0", C.muted], ["todo", "0", C.muted], ["duration_ms", "323.663", C.muted]];

  // build content lines
  const content = [];
  content.push({ k: "cmd", t: "node --test --experimental-strip-types src/**/*.test.ts" });
  content.push({ k: "blank" });
  for (const [file, count, samples] of groups) {
    content.push({ k: "file", t: file, n: count });
    samples.forEach((s) => content.push({ k: "pass", t: s }));
    const more = count - samples.length;
    if (more > 0) content.push({ k: "more", t: `… +${more} more` });
  }
  content.push({ k: "blank" });
  summary.forEach(([key, val, c]) => content.push({ k: "sum", key, val, c }));

  const lineH = 21, top = 96, padX = 28;
  const W = 1120;
  const winX = 36, winY = 44, barH = 40;
  const winH = barH + 20 + content.length * lineH + 20;
  const H = winY + winH + 56;

  let g = "";
  g += `<rect x="${winX}" y="${winY}" width="${W - 72}" height="${winH}" rx="12" fill="${C.panel}" stroke="${C.border}" stroke-width="1.5"/>`;
  g += `<path d="M${winX},${winY + 12} a12,12 0 0 1 12,-12 h${W - 72 - 24} a12,12 0 0 1 12,12 v${barH - 12} h-${W - 72} z" fill="${C.card2}"/>`;
  g += `<circle cx="${winX + 20}" cy="${winY + 20}" r="6" fill="#ff5f56"/><circle cx="${winX + 40}" cy="${winY + 20}" r="6" fill="#ffbd2e"/><circle cx="${winX + 60}" cy="${winY + 20}" r="6" fill="#27c93f"/>`;
  g += `<text x="${winX + 86}" y="${winY + 25}" font-family="${MONO}" font-size="12.5" fill="${C.muted}">node --test — visaflow</text>`;
  g += pill(W - 48, winY + 9, "62 passing", C.green, { anchor: "end" });

  const cx = winX + padX;
  let y = winY + top - 40;
  content.forEach((c) => {
    y += lineH;
    if (c.k === "blank") return;
    if (c.k === "cmd") {
      g += `<text x="${cx}" y="${y}" font-family="${MONO}" font-size="13.5" xml:space="preserve"><tspan fill="${C.green}">$ </tspan><tspan fill="${C.text}">${esc(c.t)}</tspan></text>`;
    } else if (c.k === "file") {
      g += `<text x="${cx}" y="${y}" font-family="${MONO}" font-size="13.5" xml:space="preserve"><tspan fill="${C.indigo}">▸ </tspan><tspan fill="${C.muted}">${esc(c.t)}</tspan><tspan fill="${C.faint}">  (${c.n})</tspan></text>`;
    } else if (c.k === "pass") {
      g += `<text x="${cx + 18}" y="${y}" font-family="${MONO}" font-size="13" xml:space="preserve"><tspan fill="${C.green}">✔ </tspan><tspan fill="${C.text}">${esc(c.t)}</tspan></text>`;
    } else if (c.k === "more") {
      g += `<text x="${cx + 30}" y="${y}" font-family="${MONO}" font-size="12.5" fill="${C.faint}">${esc(c.t)}</text>`;
    } else if (c.k === "sum") {
      g += `<text x="${cx}" y="${y}" font-family="${MONO}" font-size="13.5" xml:space="preserve"><tspan fill="${C.cyan}">ℹ </tspan><tspan fill="${C.muted}">${esc(c.key)} </tspan><tspan fill="${c.c}" font-weight="700">${esc(c.val)}</tspan></text>`;
    }
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${defs()}<rect width="${W}" height="${H}" fill="url(#bgg)"/>
    ${g}
    ${caption(W, H, "VisaFlow · node:test runner — 62/62 passing", "visaflow-quality-and-delivery")}
  </svg>`;
  return svg;
}

// ---- run --------------------------------------------------------------------
renderSvg("requirements-engine.svg", requirementsEngine());
renderSvg("runtime-architecture.svg", runtimeArchitecture());
await renderPng("reviewer-queue.png", reviewerQueue());
await renderPng("apply-reviewer-decision-rpc.png", rpcCode());
await renderPng("document-extraction-state.png", extractionState());
await renderPng("test-coverage.png", testCoverage());
console.log("\nAll 6 assets generated in", OUT);
