import { v4 as uuidv4 } from "uuid";
import { coreV1Api } from "../utils/k8sClient";
import { HelmService } from "./helm.service";
import { pool } from "../utils/db";

export type StoreStatus = "provisioning" | "ready" | "failed" | "deleted";

/**
 * DB row shape (snake_case from Postgres)
 */
interface StoreRow {
  store_id: string;
  store_name: string;
  namespace: string;
  status: StoreStatus;
  url: string;
  created_at: Date;
  deleted_at: Date | null;
}

/**
 * API shape (camelCase)
 */
export interface Store {
  storeId: string;
  storeName: string;
  namespace: string;
  status: StoreStatus;
  url: string;
  createdAt: Date;
  deletedAt?: Date | null;
}

export class StoreService {
  private helmService: HelmService;

  constructor() {
    this.helmService = new HelmService();

    // Reconciliation loop
    setInterval(() => {
      this.reconcileProvisioning().catch((err) =>
        console.error("Reconciliation error:", err)
      );
    }, 5000);
  }

  /**
   * Map DB row -> API object
   */
  private mapRow(row: StoreRow): Store {
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

  /**
   * CREATE STORE (DB is source of truth)
   */
  async createStore(storeName: string): Promise<Store> {
    console.log("🔥 createStore called with:", storeName);

    const storeId = uuidv4().split("-")[0];
    const namespace = `store-${storeId}`;
    const url = `http://store-${storeId}.localhost:8080`;

    const { rows } = await pool.query<StoreRow>(
      `
      INSERT INTO stores (store_id, store_name, namespace, status, url)
      VALUES ($1, $2, $3, 'provisioning', $4)
      RETURNING *
      `,
      [storeId, storeName, namespace, url]
    );

    const row = rows[0];
    console.log("✅ DB INSERT SUCCESS:", row);

    // Fire & forget provisioning (IMPORTANT: use snake_case from DB)
    this.provisionStore(row).catch((err) => {
      console.error("❌ Provisioning error:", err);
    });

    return this.mapRow(row);
  }

  /**
   * PROVISION STORE
   */
  private async provisionStore(row: StoreRow): Promise<void> {
    const storeId = row.store_id;
    const namespace = row.namespace;

    // Create namespace (idempotent)
    try {
      await coreV1Api.createNamespace({
        body: {
          metadata: {
            name: namespace,
            labels: {
              "store-id": storeId,
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

    // 🔥 CRITICAL: PASS CORRECT FIELDS (NO undefined anymore)
    await this.helmService.installWordPress({
      storeId: row.store_id,
      storeName: row.store_name,
      namespace: row.namespace,
    });
  }

  /**
   * LIST STORES (THIS WAS FAILING)
   */
  async getStores(): Promise<Store[]> {
    try {
      const { rows } = await pool.query<StoreRow>(
        `
        SELECT *
        FROM stores
        WHERE status != 'deleted'
        ORDER BY created_at DESC
        `
      );

      return rows.map((row) => this.mapRow(row));
    } catch (error) {
      console.error("💥 Failed to list stores:", error);
      throw error;
    }
  }

  /**
   * GET SINGLE STORE
   */
  async getStore(storeId: string): Promise<Store | null> {
    const { rows } = await pool.query<StoreRow>(
      "SELECT * FROM stores WHERE store_id=$1",
      [storeId]
    );

    if (!rows[0]) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * DELETE STORE
   */
  async deleteStore(storeId: string): Promise<void> {
    const store = await this.getStore(storeId);
    if (!store) throw new Error("Store not found");

    await this.helmService.uninstallWordPress(
      store.storeId,
      store.namespace
    );

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

  /**
   * RECONCILIATION LOOP
   */
  private async reconcileProvisioning(): Promise<void> {
    const { rows } = await pool.query<StoreRow>(
      "SELECT * FROM stores WHERE status = 'provisioning'"
    );

    for (const row of rows) {
      const helmStatus = await this.helmService.getHelmStatus(
        row.store_id,
        row.namespace
      );

      if (helmStatus === "deployed") {
        await pool.query(
          "UPDATE stores SET status='ready' WHERE store_id=$1",
          [row.store_id]
        );
      }

      if (helmStatus === "failed") {
        await pool.query(
          "UPDATE stores SET status='failed' WHERE store_id=$1",
          [row.store_id]
        );
      }
    }
  }
}
