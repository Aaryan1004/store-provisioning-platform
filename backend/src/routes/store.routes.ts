import { Router, Request, Response } from 'express';
import { StoreService } from '../services/store.service';

const router = Router();
const storeService = new StoreService();

/**
 * Create a new store
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Store name is required' });
    }

    const store = await storeService.createStore(name);

    res.status(201).json({
      storeId: store.storeId,
      storeName: store.storeName,
      namespace: store.namespace,
      status: store.status,
      url: store.url,
      createdAt: store.createdAt,
    });
  } catch (error) {
    console.error('Error creating store:', error);
    res.status(500).json({ error: 'Failed to create store' });
  }
});

/**
 * ✅ List all stores (FIXED)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const stores = await storeService.getStores(); // 🔥 await was missing

    res.json({
      count: stores.length,
      stores,
    });
  } catch (error) {
    console.error('Error listing stores:', error);
    res.status(500).json({ error: 'Failed to list stores' });
  }
});

/**
 * ✅ Get a specific store (FIXED)
 */
router.get('/:storeId', async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;

    const store = await storeService.getStore(storeId); // 🔥 await was missing

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    res.json(store);
  } catch (error) {
    console.error('Error fetching store:', error);
    res.status(500).json({ error: 'Failed to fetch store' });
  }
});

/**
 * Delete a store
 */
router.delete('/:storeId', async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;

    await storeService.deleteStore(storeId);

    res.json({
      storeId,
      status: 'deleted',
      deletedAt: new Date(),
    });
  } catch (error) {
    console.error('Error deleting store:', error);
    res.status(500).json({ error: 'Failed to delete store' });
  }
});

export default router;
