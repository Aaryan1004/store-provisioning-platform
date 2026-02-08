import { v4 as uuidv4 } from "uuid";
import { coreV1Api } from "../utils/k8sClient";
import { HelmService } from "./helm.service";
import { pool } from "../utils/db";

export type StoreStatus = "provisioning" | "ready" | "failed" | "deleted";

export interface Store {
  storeId: string;
  storeName: string;
  namespace: string;
  status: StoreStatus;
  url?: string;
  createdAt: Date;
  deletedAt?: Date;
}

export class StoreService {
  private helmService: HelmService;

  constructor() {
    this.helmService = new HelmService();

    // 🔁 Reconciliation loop (CRITICAL)
    setInterval(() => {
      this.reconcileProvisioning().catch((err) =>
        console.error("Reconciliation error", err)
      );
    }, 5000);
  }

  /**
   * CREATE STORE (DB is source of truth)
   */
  async createStore(storeName: string): Promise<Store> {
    const storeId = uuidv4().split("-")[0];
    const namespace = `store-${storeId}`;
    const url = `http://store-${storeId}.localhost:8080`;

    const { rows } = await pool.query(
      `
      INSERT INTO stores (store_id, store_name, namespace, status, url)
      VALUES ($1, $2, $3, 'provisioning', $4)
      RETURNING *
      `,
      [storeId, storeName, namespace, url]
    );

    const store = rows[0];

    // 🚀 Fire-and-forget provisioning
    this.provisionStore(store).catch((err) => {
      console.error(`Provisioning error for ${store.store_id}`, err);
      // ❗ DO NOT mark failed here — reconciliation will decide
    });

    return store;
  }

  /**
   * PROVISION STORE (NO premature failure)
   */
  private async provisionStore(store: Store): Promise<void> {
    // Namespace is idempotent
    try {
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
    } catch (err: any) {
      if (err?.body?.reason !== "AlreadyExists") {
        throw err;
      }
    }

    await this.helmService.installWordPress({
      storeId: store.storeId,
      storeName: store.storeName,
      namespace: store.namespace,
    });
  }

  /**
   * 🔁 RECONCILIATION LOOP
   * Helm is the truth, DB follows
   */
  private async reconcileProvisioning(): Promise<void> {
    const { rows } = await pool.query(
      "SELECT * FROM stores WHERE status = 'provisioning'"
    );

    for (const store of rows) {
      const helmStatus = this.helmService.getHelmStatus(
        store.store_id,
        store.namespace
      );

      if (helmStatus === "deployed") {
        await pool.query(
          "UPDATE stores SET status='ready' WHERE store_id=$1",
          [store.store_id]
        );
      }

      if (helmStatus === "failed") {
        await pool.query(
          "UPDATE stores SET status='failed' WHERE store_id=$1",
          [store.store_id]
        );
      }
    }
  }

  /**
   * LIST STORES
   */
  async getStores(): Promise<Store[]> {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM stores
      WHERE status != 'deleted'
      ORDER BY created_at DESC
      `
    );
    return rows;
  }

  /**
   * GET SINGLE STORE
   */
  async getStore(storeId: string): Promise<Store | null> {
    const { rows } = await pool.query(
      "SELECT * FROM stores WHERE store_id=$1",
      [storeId]
    );
    return rows[0] ?? null;
  }

  /**
   * DELETE STORE (CLEAN TEARDOWN)
   */
  async deleteStore(storeId: string): Promise<void> {
    const store = await this.getStore(storeId);
    if (!store) throw new Error("Store not found");

    await this.helmService.uninstallWordPress(storeId, store.namespace);

    await coreV1Api.deleteNamespace({
      name: store.namespace,
    });

    await pool.query(
      `
      UPDATE stores
      SET status='deleted', deleted_at=NOW()
      WHERE store_id=$1
      `,
      [storeId]
    );
  }
}
