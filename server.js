// server.js
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "512kb" }));
app.use(express.static("public"));

const SHARED_SECRET = process.env.MT5_SHARED_SECRET || "change-me";

// in-memory state: account → { at, volumes }
const state = new Map();

// EA posts here
app.post("/mt5/positions", (req, res) => {
  if (req.get("x-mt5-secret") !== SHARED_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const body = req.body || {};
  const account = String(body.account || "unknown");

  // build symbol → total volume
  const volumes = {};
  for (const p of (body.positions || [])) {
    const sym = p.symbol;
    const vol = Number(p.volume) || 0;
    volumes[sym] = (volumes[sym] || 0) + vol;
  }

  state.set(account, { at: Date.now(), volumes });

  return res.json({ ok: true });
});

// return simple summary
app.get("/summary", (req, res) => {
  const result = {};
  for (const [acct, v] of state) {
    result[acct] = v.volumes;
  }
  res.json(result);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Listening on", port));

// in server.js
app.get("/healthz", (req,res) => res.json({ ok: true, accounts: Array.from(state.keys()).length }));
