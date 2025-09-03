// /api/index.js
import app from '../src/app.js';

// En Vercel el *default export* es el handler.
// Express `app` ya es una función (req, res) compatible.
export default app;
