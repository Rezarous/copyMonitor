// server.js
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "512kb" }));
app.use(express.static("public"));

const SHARED_SECRET = process.env.MT5_SHARED_SECRET || "change-me";

// in-memory state: account → { iso, profit, volumes }
const state = new Map();

// EA posts here
app.post("/mt5/positions", (req, res) => {
  if (req.get("x-mt5-secret") !== SHARED_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const body = req.body || {};
  const account = String(body.account || "unknown");

  // Sum volumes per symbol (lots)
  const volumes = {};
  for (const p of (body.positions || [])) {
    const sym = p.symbol;
    const vol = Number(p.volume) || 0;
    volumes[sym] = (volumes[sym] || 0) + vol;
  }

  const atMs = Date.now();
  const profit = (body.profit !== undefined && body.profit !== null)
    ? Number(body.profit)
    : NaN;

  state.set(account, {
    iso: new Date(atMs).toISOString(),
    profit: Number.isFinite(profit) ? profit : null,
    volumes
  });

  return res.json({ ok: true });
});

// Dashboard summary
app.get("/summary", (req, res) => {
  const accounts = {};
  const volumes = {};
  for (const [acct, v] of state) {
    accounts[acct] = {
      iso: v.iso,
      profit: v.profit // may be null if not sent
    };
    volumes[acct] = v.volumes;
  }
  res.json({ accounts, volumes });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Listening on", port));
