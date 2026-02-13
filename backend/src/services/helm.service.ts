import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";
import yaml from "js-yaml";

const execAsync = promisify(exec);

export interface HelmInstallConfig {
  storeId: string;
  storeName: string;
  namespace: string;
}

export class HelmService {
  private valuesDir = "/tmp/helm-values";

  constructor() {
    fs.mkdirSync(this.valuesDir, { recursive: true });
  }

  /* ----------------------------- helpers ----------------------------- */

  private generatePassword(len = 16): string {
    return randomBytes(len).toString("base64").slice(0, len);
  }

  /* ----------------------- values generation -------------------------- */

  private generateWooCommerceValues(storeId: string, storeName: string) {
    return {
      wordpressBlogName: storeName,
      wordpressUsername: "admin",
      wordpressPassword: this.generatePassword(16),
      wordpressEmail: `admin@store-${storeId}.local`,

      ingress: {
        enabled: true,
        ingressClassName: "traefik",
        hostname: `store-${storeId}.localhost`,
        path: "/",
        pathType: "Prefix",
      },

      service: {
        type: "ClusterIP",
      },

      networkPolicy: { enabled: false },

      mariadb: {
        networkPolicy: { enabled: false },
        auth: {
          rootPassword: this.generatePassword(20),
          database: "bitnami_wordpress",
          username: "bn_wordpress",
          password: this.generatePassword(20),
        },
        primary: {
          persistence: {
            enabled: true,
            storageClass: "local-path",
            size: "10Gi",
          },
        },
      },

      persistence: {
        enabled: true,
        storageClass: "local-path",
        size: "5Gi",
      },
    };
  }

  /* ------------------------- install store ---------------------------- */

  async installWordPress({
    storeId,
    storeName,
    namespace,
  }: HelmInstallConfig): Promise<void> {
    const values = this.generateWooCommerceValues(storeId, storeName);
    const valuesPath = path.join(this.valuesDir, `store-${storeId}.yaml`);

    fs.writeFileSync(valuesPath, yaml.dump(values));

    const cmd = `
helm install store-${storeId} bitnami/wordpress \
  --namespace ${namespace} \
  --create-namespace \
  -f ${valuesPath} \
  --wait \
  --timeout 10m
`.trim();

    console.log(`🚀 Installing store ${storeId}`);

    try {
      const { stdout, stderr } = await execAsync(cmd);

      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);

      console.log(`✅ Store ${storeId} installed`);
    } catch (err: any) {
      console.error(`❌ Helm install failed for ${storeId}`);
      console.error(err?.stderr || err);
      throw err;
    }
  }

  /* ------------------------- uninstall store -------------------------- */

  async uninstallWordPress(
    storeId: string,
    namespace: string
  ): Promise<void> {
    try {
      console.log(`🗑️ Uninstalling store ${storeId}`);
      await execAsync(
        `helm uninstall store-${storeId} -n ${namespace}`
      );
      console.log(`✅ Store ${storeId} uninstalled`);
    } catch (err) {
      console.warn(
        `⚠️ Helm uninstall failed (ignored) for store ${storeId}`
      );
    }
  }

  /* ------------------------- helm status ------------------------------ */

  /**
   * Returns:
   * deployed | failed | pending-install | pending-upgrade | not-found
   */
  async getHelmStatus(
    storeId: string,
    namespace: string
  ): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `helm status store-${storeId} -n ${namespace} -o json`
      );

      const parsed = JSON.parse(stdout);
      return parsed?.info?.status ?? "unknown";
    } catch {
      return "not-found";
    }
  }
}
