// import { coreV1Api } from "../utils/k8sClient";
// import { V1Namespace } from "@kubernetes/client-node";

// export async function createStoreNamespace(storeId: string) {
//   const namespaceName = `store-${storeId}`;

//   const namespace: V1Namespace = {
//     metadata: {
//       name: namespaceName,
//       labels: {
//         "app.kubernetes.io/managed-by": "store-provisioning-platform",
//         "store-id": storeId,
//       },
//     },
//   };

//  await coreV1Api.createNamespace({
//   body: namespace,
// });

//   return namespaceName;
// }

// export async function deleteStoreNamespace(storeId: string) {
//   const namespaceName = `store-${storeId}`;

//   try {
//     await coreV1Api.deleteNamespace({
//         name: namespaceName,
//     });
//     return true;
//   } catch (err: any) {
//     // Idempotency: deleting an already-deleted namespace should not fail
//     if (err?.response?.statusCode === 404) {
//       return true;
//     }
//     throw err;
//   }
// }
import { v4 as uuidv4 } from "uuid";
import { coreV1Api } from "../utils/k8sClient";
import { HelmService } from "./helm.service";
import { pool } from "../db";

export interface Store {
  storeId: string;
  storeName: string;
  namespace: string;
  status: "provisioning" | "ready" | "failed" | "deleted";
  url?: string;
  createdAt: Date;
  deletedAt?: Date | null;
}

export class StoreService {
  private helmService: HelmService;

  constructor() {
    this.helmService = new HelmService();

    try {
      this.helmService.addBitnamiRepo();
    } catch (error) {
      console.warn("⚠️ Bitnami repo already exists or failed to add");
    }
  }

  /**
   * Create a new store (DB-first, async provisioning)
   */
  async createStore(storeName: string): Promise<Store> {
    const storeId = uuidv4().split("-")[0];
    const namespace = `store-${storeId}`;
    const url = `http://store-${storeId}.localhost:8080`;

    const result = await pool.query(
      `
      INSERT INTO stores (store_id, store_name, namespace, status, url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [storeId, storeName, namespace, "provisioning", url]
    );

    const store = this.mapRow(result.rows[0]);

    // Provision asynchronously
    this.provisionStore(store).catch(async (err) => {
      console.error(`❌ Provisioning failed for ${storeId}`, err);
      await pool.query(
        `UPDATE stores SET status = 'failed' WHERE store_id = $1`,
        [storeId]
      );
    });

    return store;
  }

  /**
   * Provision store infra (namespace + Helm)
   */
  private async provisionStore(store: Store): Promise<void> {
    try {
      console.log(`🚀 Provisioning store ${store.storeId}`);

      // 1. Create namespace
      await coreV1Api.createNamespace({
        body: {
          metadata: {
            name: store.namespace,
            labels: {
              "store-id": store.storeId,
              "managed-by": "store-provisioning-platform",
            },
          },
        },
      });

      // 2. Install WooCommerce via Helm
      await this.helmService.installWordPress({
        storeId: store.storeId,
        storeName: store.storeName,
        chartName: "bitnami/wordpress",
        namespace: store.namespace,
      });

      // 3. Mark READY
      await pool.query(
        `UPDATE stores SET status = 'ready' WHERE store_id = $1`,
        [store.storeId]
      );

      console.log(`✅ Store ${store.storeId} READY`);
    } catch (err) {
      console.error(`❌ Provisioning error for ${store.storeId}`, err);

      await pool.query(
        `UPDATE stores SET status = 'failed' WHERE store_id = $1`,
        [store.storeId]
      );

      throw err;
    }
  }

  /**
   * List all stores
   */
  async getStores(): Promise<Store[]> {
    const result = await pool.query(
      `SELECT * FROM stores ORDER BY created_at DESC`
    );
    return result.rows.map(this.mapRow);
  }

  /**
   * Get store by ID
   */
  async getStore(storeId: string): Promise<Store | null> {
    const result = await pool.query(
      `SELECT * FROM stores WHERE store_id = $1`,
      [storeId]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Delete store (Helm uninstall + namespace delete)
   */
  async deleteStore(storeId: string): Promise<void> {
    const result = await pool.query(
      `SELECT * FROM stores WHERE store_id = $1`,
      [storeId]
    );

    if (!result.rows[0]) {
      throw new Error(`Store ${storeId} not found`);
    }

    const store = this.mapRow(result.rows[0]);

    await this.helmService.uninstallWordPress(store.storeId, store.namespace);
    await coreV1Api.deleteNamespace({ name: store.namespace });

    await pool.query(
      `
      UPDATE stores
      SET status = 'deleted', deleted_at = NOW()
      WHERE store_id = $1
      `,
      [storeId]
    );

    console.log(`🗑️ Store ${storeId} deleted`);
  }

  /**
   * DB row → Store object
   */
  private mapRow(row: any): Store {
    return {
      storeId: row.store_id,
      storeName: row.store_name,
      namespace: row.namespace,
      status: row.status,
      url: row.url,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
    };
  }
}
