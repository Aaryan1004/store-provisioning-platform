import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";
import yaml from "js-yaml";

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

  generateWooCommerceValues(storeId: string, storeName: string) {
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

      /* 🔒 Explicitly disable policies that require extra RBAC */
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
    execSync(cmd, { stdio: "inherit" });
    console.log(`✅ Store ${storeId} installed`);
  }

  /* ------------------------- uninstall store -------------------------- */

  async uninstallWordPress(storeId: string, namespace: string): Promise<void> {
    try {
      execSync(`helm uninstall store-${storeId} -n ${namespace}`, {
        stdio: "inherit",
      });
    } catch {
      // ignore – namespace deletion will clean up anyway
    }
  }

  /* ------------------------- helm status ------------------------------ */

  /**
   * Returns: deployed | failed | pending-install | not-found
   */
  getHelmStatus(storeId: string, namespace: string): string {
    try {
      const output = execSync(
        `helm status store-${storeId} -n ${namespace} -o json`,
        { encoding: "utf-8" }
      );

      const parsed = JSON.parse(output);
      return parsed.info?.status ?? "unknown";
    } catch {
      return "not-found";
    }
  }
}
