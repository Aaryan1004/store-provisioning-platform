import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import storeRoutes from './routes/store.routes';
import k8sRoutes from './routes/k8s.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'store-provisioning-backend',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/stores', storeRoutes);
app.use('/api/k8s', k8sRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Backend API running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});