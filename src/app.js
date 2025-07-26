import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import businessRoutes from './routes/business.routes.js';
import './models/services.js';




const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);


// Handler de errores
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Error interno' });
});

export default app;
