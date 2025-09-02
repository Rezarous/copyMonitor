import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// absolute static path so it works everywhere
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// optional belt-and-suspenders explicit route for CSS
app.get("/style.css", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "style.css"));
});

const SHARED_SECRET = process.env.MT5_SHARED_SECRET || "change-me";

// in-memory state: account → snapshot
// snapshot = { iso, profit, volumes, positions }
const state = new Map();

// --- break-even helper ---
// For one symbol list: P = Σ(s*v*open) / Σ(s*v), s=+1 BUY, -1 SELL
function computeBreakEvenForSymbol(posList) {
  let num = 0, den = 0;
  for (const p of posList) {
    const side = String(p.type || "").toUpperCase();
    const s = side === "BUY" ? 1 : side === "SELL" ? -1 : 0;
    const v = Number(p.volume) || 0;
    const po = Number(p.price_open);
    if (!s || !v || !Number.isFinite(po)) continue;
    num += s * v * po;
    den += s * v;
  }
  if (!den) return null;
  return num / den;
}

// EA posts here
app.post("/mt5/positions", (req, res) => {
  if (req.get("x-mt5-secret") !== SHARED_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const body = req.body || {};
  const account = String(body.account || "unknown");

  // volumes per symbol
  const volumes = {};
  for (const p of (body.positions || [])) {
    const sym = p.symbol;
    const vol = Number(p.volume) || 0;
    volumes[sym] = (volumes[sym] || 0) + vol;
  }

  // slim positions (we need price_open for BE)
  const positions = (body.positions || []).map(p => ({
    ticket: p.ticket ?? null,
    symbol: p.symbol ?? null,
    type: p.type ?? null,                 // "BUY"/"SELL"
    volume: Number(p.volume) || 0,
    price_open: p.price_open != null ? Number(p.price_open) : null,
    profit: p.profit != null ? Number(p.profit) : null
  }));

  state.set(account, {
    iso: new Date().toISOString(),
    profit: body.profit != null ? Number(body.profit) : null, // ACCOUNT_PROFIT if you send it
    volumes,
    positions
  });

  res.json({ ok: true });
});

// dashboard summary
app.get("/summary", (_req, res) => {
  const accounts = {};
  const volumes = {};
  const positions = {};
  const breakevens = {}; // account -> { symbol: price|null }

  for (const [acct, snap] of state) {
    accounts[acct] = { iso: snap.iso, profit: snap.profit };
    volumes[acct] = snap.volumes;
    positions[acct] = snap.positions;

    const bySym = new Map();
    for (const p of snap.positions || []) {
      if (!p.symbol) continue;
      if (!bySym.has(p.symbol)) bySym.set(p.symbol, []);
      bySym.get(p.symbol).push(p);
    }
    const be = {};
    for (const [sym, list] of bySym) be[sym] = computeBreakEvenForSymbol(list);
    breakevens[acct] = be;
  }

  res.json({ accounts, volumes, positions, breakevens });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Listening on http://localhost:" + port));
