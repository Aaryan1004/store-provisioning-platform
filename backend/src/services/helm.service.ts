import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

export interface HelmInstallConfig {
  storeId: string;
  storeName: string;
  chartName: string;
  namespace: string;
}

export class HelmService {
  private valuesDir = '/tmp/helm-values';

  constructor() {
    // Ensure values directory exists
    if (!fs.existsSync(this.valuesDir)) {
      fs.mkdirSync(this.valuesDir, { recursive: true });
    }
  }

  /**
   * Generate secure random password
   */
  private generatePassword(length: number = 16): string {
    return randomBytes(length).toString('base64').slice(0, length);
  }

  /**
   * Generate Helm values for WooCommerce store
   */
  generateWooCommerceValues(storeId: string, storeName: string): object {
    const rootPassword = this.generatePassword(20);
    const userPassword = this.generatePassword(20);

    return {
      // WordPress configuration
      wordpressBlogName: storeName,
      wordpressUsername: 'admin',
      wordpressPassword: this.generatePassword(16),
      wordpressEmail: `admin@store-${storeId}.local`,
      
      // Ingress configuration
      ingress: {
        enabled: true,
        ingressClassName: 'traefik',
        hostname: `store-${storeId}.localhost`,
        path: '/',
        pathType: 'Prefix',
        tls: false,
      },

      // Service configuration
      service: {
        type: 'ClusterIP',
        port: 80,
      },

      // MariaDB configuration
      mariadb: {
        enabled: true,
        auth: {
          rootPassword: rootPassword,
          database: 'bitnami_wordpress',
          username: 'bn_wordpress',
          password: userPassword,
        },
        primary: {
          persistence: {
            enabled: true,
            storageClass: 'local-path',
            size: '10Gi',
          },
          resources: {
            requests: {
              cpu: '250m',
              memory: '512Mi',
            },
            limits: {
              cpu: '500m',
              memory: '1Gi',
            },
          },
        },
      },

      // WordPress persistence
      persistence: {
        enabled: true,
        storageClass: 'local-path',
        size: '5Gi',
      },

      // Resource limits
      resources: {
        requests: {
          cpu: '250m',
          memory: '512Mi',
        },
        limits: {
          cpu: '1000m',
          memory: '1Gi',
        },
      },

      // Probes
      livenessProbe: {
        enabled: true,
        initialDelaySeconds: 120,
        periodSeconds: 10,
        timeoutSeconds: 5,
        failureThreshold: 6,
      },
      readinessProbe: {
        enabled: true,
        initialDelaySeconds: 30,
        periodSeconds: 5,
        timeoutSeconds: 3,
        failureThreshold: 6,
      },
    };
  }

  /**
   * Write values to YAML file
   */
  private writeValuesFile(storeId: string, values: object): string {
    const valuesPath = path.join(this.valuesDir, `store-${storeId}-values.yaml`);
    
    // Convert object to YAML manually (simple approach)
    const yamlContent = this.objectToYaml(values);
    fs.writeFileSync(valuesPath, yamlContent, 'utf-8');
    
    return valuesPath;
  }

  /**
   * Simple object to YAML converter
   */
  private objectToYaml(obj: any, indent: number = 0): string {
    let yaml = '';
    const spaces = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        yaml += `${spaces}${key}: null\n`;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        yaml += this.objectToYaml(value, indent + 1);
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        value.forEach(item => {
          if (typeof item === 'object') {
            yaml += `${spaces}- \n`;
            yaml += this.objectToYaml(item, indent + 2);
          } else {
            yaml += `${spaces}- ${item}\n`;
          }
        });
      } else if (typeof value === 'boolean') {
        yaml += `${spaces}${key}: ${value}\n`;
      } else if (typeof value === 'number') {
        yaml += `${spaces}${key}: ${value}\n`;
      } else {
        // String values - quote if contains special characters
        const needsQuotes = /[:#{}[\],&*!|>'"%@`]/.test(value as string);
        yaml += `${spaces}${key}: ${needsQuotes ? `"${value}"` : value}\n`;
      }
    }

    return yaml;
  }

  /**
   * Add Bitnami Helm repository (run once)
   */
  addBitnamiRepo(): void {
    try {
      console.log('📦 Adding Bitnami Helm repository...');
      execSync('helm repo add bitnami https://charts.bitnami.com/bitnami', {
        stdio: 'inherit',
      });
      execSync('helm repo update', { stdio: 'inherit' });
      console.log('✅ Bitnami repo added successfully');
    } catch (error) {
      console.error('❌ Failed to add Bitnami repo:', error);
      throw error;
    }
  }

  /**
   * Install WordPress Helm chart
   */
  async installWordPress(config: HelmInstallConfig): Promise<void> {
    const { storeId, storeName, namespace } = config;

    try {
      // Generate values
      const values = this.generateWooCommerceValues(storeId, storeName);
      
      // Write values file
      const valuesPath = this.writeValuesFile(storeId, values);
      
      console.log(`📦 Installing Helm chart for store: ${storeId}`);
      console.log(`📄 Values file: ${valuesPath}`);

      // Helm install command
      const helmCommand = `helm install store-${storeId} bitnami/wordpress \
        --namespace ${namespace} \
        --create-namespace \
        -f ${valuesPath} \
        --wait \
        --timeout 10m`;

      console.log(`🚀 Running: ${helmCommand}`);
      
      execSync(helmCommand, {
        stdio: 'inherit',
        env: { ...process.env },
      });

      console.log(`✅ Helm chart installed for store: ${storeId}`);
    } catch (error) {
      console.error(`❌ Helm install failed for store: ${storeId}`, error);
      throw error;
    }
  }

  /**
   * Uninstall WordPress Helm chart
   */
  async uninstallWordPress(storeId: string, namespace: string): Promise<void> {
    try {
      console.log(`🗑️  Uninstalling Helm release for store: ${storeId}`);

      const helmCommand = `helm uninstall store-${storeId} --namespace ${namespace}`;
      
      execSync(helmCommand, {
        stdio: 'inherit',
      });

      // Clean up values file
      const valuesPath = path.join(this.valuesDir, `store-${storeId}-values.yaml`);
      if (fs.existsSync(valuesPath)) {
        fs.unlinkSync(valuesPath);
      }

      console.log(`✅ Helm release uninstalled for store: ${storeId}`);
    } catch (error) {
      console.error(`❌ Helm uninstall failed for store: ${storeId}`, error);
      // Don't throw - namespace deletion will clean up anyway
    }
  }

  /**
   * Get Helm release status
   */
  getHelmStatus(storeId: string, namespace: string): string {
    try {
      const output = execSync(
        `helm status store-${storeId} --namespace ${namespace} -o json`,
        { encoding: 'utf-8' }
      );
      const status = JSON.parse(output);
      return status.info.status; // deployed, failed, pending-install, etc.
    } catch (error) {
      return 'not-found';
    }
  }
}