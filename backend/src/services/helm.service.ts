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
  private repoInitialized = false;

  constructor() {
    fs.mkdirSync(this.valuesDir, { recursive: true });
  }

  /* ---------------- HELM REPO BOOTSTRAP (CRITICAL FIX) ---------------- */
  private async ensureBitnamiRepo(): Promise<void> {
    if (this.repoInitialized) return;

    console.log("📦 Ensuring Bitnami Helm repo exists...");

    try {
      // Check if repo already exists
      const { stdout } = await execAsync("helm repo list");
      
      if (!stdout.includes("bitnami")) {
        console.log("📦 Adding Bitnami Helm repository...");
        await execAsync(
          "helm repo add bitnami https://charts.bitnami.com/bitnami"
        );
      } else {
        console.log("📦 Bitnami repo already present");
      }

      // Always update (safe + demo reliable)
      await execAsync("helm repo update");
      console.log("✅ Bitnami repo ready");

      this.repoInitialized = true;
    } catch (err) {
      console.error("❌ Failed to setup Helm repo:", err);
      throw err;
    }
  }

  /* ---------------- PASSWORD HELPER ---------------- */
  private generatePassword(len = 16): string {
    return randomBytes(len).toString("base64").slice(0, len);
  }

  /* ---------------- VALUES GENERATION ---------------- */
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

      // Disable network policies (RBAC safe)
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

  /* ---------------- INSTALL STORE (FINAL) ---------------- */
  async installWordPress({
    storeId,
    storeName,
    namespace,
  }: HelmInstallConfig): Promise<void> {
    console.log(`🚀 Installing store ${storeId}`);

    // 🔥 CRITICAL: Ensure repo inside container
    await this.ensureBitnamiRepo();

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

  /* ---------------- UNINSTALL ---------------- */
  async uninstallWordPress(
    storeId: string,
    namespace: string
  ): Promise<void> {
    try {
      console.log(`🗑️ Uninstalling store ${storeId}`);
      await execAsync(`helm uninstall store-${storeId} -n ${namespace}`);
      console.log(`✅ Store ${storeId} uninstalled`);
    } catch {
      console.warn(`⚠️ Helm uninstall ignored for ${storeId}`);
    }
  }

  /* ---------------- HELM STATUS ---------------- */
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
