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

    // 🔁 CRITICAL: slower reconcile (Helm charts take time)
    setInterval(async () => {
      try {
        await this.reconcileProvisioning();
      } catch (err) {
        console.error("Reconciliation error:", err);
      }
    }, 15000); // 15s (NOT 5s)
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
   * CREATE STORE (DB = source of truth)
   */
  async createStore(storeName: string): Promise<Store> {
    console.log("🔥 createStore called with:", storeName);

    if (!storeName || storeName.trim().length === 0) {
      throw new Error("Store name is required");
    }

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

    // Non-blocking provisioning
    this.provisionStore(row).catch(async (err) => {
      console.error("❌ Provisioning failed:", err);
      await pool.query(
        "UPDATE stores SET status='failed' WHERE store_id=$1",
        [row.store_id]
      );
    });

    return this.mapRow(row);
  }

  /**
   * PROVISION STORE (K8s + Helm)
   */
  private async provisionStore(row: StoreRow): Promise<void> {
    const storeId = row.store_id;
    const namespace = row.namespace;

    console.log("🚀 Provisioning store:", storeId);

    // 1. Create namespace (idempotent)
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
      console.log("📦 Namespace created:", namespace);
    } catch (err: any) {
      if (err?.body?.reason !== "AlreadyExists") {
        throw err;
      }
      console.log("📦 Namespace already exists:", namespace);
    }

    // 2. Install via Helm (DO NOT mark ready here)
    await this.helmService.installWordPress({
      storeId: storeId,
      storeName: row.store_name,
      namespace: namespace,
    });

    console.log("✅ Helm install command executed for:", storeId);
  }

  /**
   * LIST STORES (Dashboard)
   */
  async getStores(): Promise<Store[]> {
    const { rows } = await pool.query<StoreRow>(
      `
      SELECT *
      FROM stores
      WHERE status != 'deleted'
      ORDER BY created_at DESC
      `
    );

    return rows.map((row) => this.mapRow(row));
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
   * DELETE STORE (CLEAN TEARDOWN)
   */
  async deleteStore(storeId: string): Promise<void> {
    const store = await this.getStore(storeId);
    if (!store) throw new Error("Store not found");

    console.log("🗑️ Deleting store:", storeId);

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

    console.log("✅ Store deleted:", storeId);
  }

  /**
   * 🔁 RECONCILIATION LOOP (HELM = SOURCE OF TRUTH)
   */
  private async reconcileProvisioning(): Promise<void> {
    const { rows } = await pool.query<StoreRow>(
      "SELECT * FROM stores WHERE status = 'provisioning'"
    );

    if (rows.length === 0) return;

    console.log(`🔁 Reconciling ${rows.length} provisioning store(s)`);

    for (const row of rows) {
      try {
        const helmStatus = await this.helmService.getHelmStatus(
          row.store_id,
          row.namespace
        );

        console.log(
          `📊 Helm status for ${row.store_id}: ${helmStatus}`
        );

        // ✅ ONLY mark ready when truly deployed
        if (helmStatus === "deployed") {
          await pool.query(
            "UPDATE stores SET status='ready' WHERE store_id=$1",
            [row.store_id]
          );
          console.log("🎉 Store READY:", row.store_id);
          continue;
        }

        // ❌ ONLY mark failed if helm explicitly failed
        if (helmStatus === "failed") {
          await pool.query(
            "UPDATE stores SET status='failed' WHERE store_id=$1",
            [row.store_id]
          );
          console.log("❌ Store FAILED:", row.store_id);
          continue;
        }

        // ⏳ DO NOTHING for:
        // not-found, pending-install, pending-upgrade
        console.log(
          `⏳ Still provisioning: ${row.store_id} (status: ${helmStatus})`
        );
      } catch (err) {
        console.error(
          `⚠️ Reconcile error for ${row.store_id}:`,
          err
        );
      }
    }
  }
}
