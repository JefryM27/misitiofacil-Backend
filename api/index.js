// /api/index.js
// ─────────────────────────────────────────────────────────────
// Serverless bridge for Express on Vercel
// Imports your existing Express app and exposes it as a handler
// ─────────────────────────────────────────────────────────────

import app from '../src/app.js';

export default function handler(req, res) {
  // Express is compatible with (req, res)
  return app(req, res);
}
