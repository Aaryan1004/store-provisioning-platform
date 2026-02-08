// import { Router } from "express";
// import { coreV1Api } from "../utils/k8sClient";

// const router = Router();

// /**
//  * GET /k8s/namespaces
//  * Lists all namespaces in the cluster
//  */
// router.get("/namespaces", async (_req, res) => {
//   try {
//     const namespaceList = await coreV1Api.listNamespace();

//     const namespaces = namespaceList.items.map(
//       (ns) => ns.metadata?.name
//     );

//     res.json({
//       count: namespaces.length,
//       namespaces,
//     });
//   } catch (err) {
//     console.error("Failed to list namespaces", err);
//     res.status(500).json({ error: "Unable to list namespaces" });
//   }
// });


// export default router;

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
 * List all stores
 */
router.get('/', (req: Request, res: Response) => {
  const stores = storeService.getStores();
  res.json({ count: stores.length, stores });
});

/**
 * Get a specific store
 */
router.get('/:storeId', (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;

  const store = storeService.getStore(storeId);

  if (!store) {
    return res.status(404).json({ error: 'Store not found' });
  }

  res.json(store);
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