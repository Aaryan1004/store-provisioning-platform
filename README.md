# 🛒 Kubernetes-Native Store Provisioning Platform

A full-stack platform that dynamically provisions isolated WooCommerce stores on Kubernetes using Helm, with a Node.js (TypeScript) backend, React dashboard, and PostgreSQL as the source of truth.

---

## 🚀 Overview

This project is a Kubernetes-native store provisioning system designed to create, manage, and delete fully isolated e-commerce stores on demand. Each store is deployed as a separate namespace using Helm and the Bitnami WordPress (WooCommerce) chart, ensuring strong isolation and scalability.

The platform includes:

* A TypeScript backend (Express) acting as the provisioning engine
* A React dashboard for store lifecycle management
* Helm charts for platform infrastructure (RBAC, Postgres, backend)
* A reconciliation loop for real-time store status tracking
* PostgreSQL as the single source of truth

---

## 🏗️ Architecture

### Core Components

1. **Backend (Node.js + TypeScript)**

   * Handles store create/list/delete APIs
   * Generates dynamic Helm values per store
   * Installs/uninstalls Helm releases
   * Reconciles store status (provisioning / ready / failed)
   * Communicates with Kubernetes API

2. **Dashboard (React + Vite + TypeScript)**

   * UI for managing store lifecycle
   * Displays real-time provisioning status
   * Interacts with backend APIs

3. **Kubernetes (k3d Local Cluster)**

   * Namespace-per-store isolation
   * Helm-based deployments
   * LoadBalancer exposure for stores

4. **Helm Platform Charts**

   * Backend deployment
   * RBAC configuration
   * PostgreSQL deployment & service

5. **PostgreSQL**

   * Stores metadata of all provisioned stores
   * Source of truth for reconciliation loop

---

## 📂 Project Structure

```
store-provisioning-platform/
│
├── backend/          # Express + TypeScript provisioning engine
├── dashboard/        # React (Vite) frontend dashboard
├── helm/             # Helm charts for platform + infrastructure
│   └── platform/
├── docs/             # Architecture notes and documentation
└── .gitignore
```

---

## ⚙️ Tech Stack

### Backend

* Node.js
* TypeScript
* Express
* Kubernetes Client (k8s API)
* Helm CLI
* PostgreSQL

### Frontend

* React
* TypeScript
* Vite

### Infrastructure

* Kubernetes (k3d)
* Helm
* Bitnami WordPress (WooCommerce)
* RBAC (ClusterRole, ServiceAccount)

---

## 🧠 Key Features

### 🔹 Dynamic Store Provisioning

* Creates a new namespace per store
* Deploys WooCommerce via Helm
* Generates unique Helm values per store

### 🔹 Real-Time Reconciliation Loop

* Periodically checks Kubernetes state
* Updates store status:

  * `PROVISIONING`
  * `READY`
  * `FAILED`
* Ensures backend state matches cluster reality

### 🔹 Isolated Multi-Tenant Architecture

* Namespace-per-store design
* Independent lifecycle management
* Clean deletion with namespace cleanup

### 🔹 Full Lifecycle APIs

* Create Store
* List Stores
* Delete Store
* Status Tracking

### 🔹 Frontend Dashboard

* Visual control panel for provisioning
* Displays store status
* Simplifies platform operations

---

## 🛠️ Local Development Setup

### Prerequisites

* Docker
* Node.js (>= 18)
* kubectl
* Helm
* k3d

---

### 1️⃣ Create Local Kubernetes Cluster (k3d)

```bash
k3d cluster create dev-cluster \
  --agents 2 \
  -p "8080:80@loadbalancer" \
  -p "8443:443@loadbalancer"
```

Verify:

```bash
kubectl get nodes
```

---

### 2️⃣ Setup Backend

```bash
cd backend
npm install
```

Run backend (dev mode):

```bash
npm run dev
```

---

### 3️⃣ Setup Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Dashboard will run on Vite dev server (typically [http://localhost:5173](http://localhost:5173))

---

### 4️⃣ Deploy Platform via Helm

```bash
cd helm/platform
helm install platform . -f values-local.yaml
```

This deploys:

* Backend service
* PostgreSQL
* RBAC resources

---

## 🔌 API Endpoints (Backend)

### Create Store

```
POST /stores
```

Creates a new WooCommerce store via Helm.

### List Stores

```
GET /stores
```

Returns all provisioned stores with status.

### Delete Store

```
DELETE /stores/:id
```

Uninstalls Helm release and deletes namespace.

---

## 🔄 Provisioning Flow

1. User requests store creation via dashboard
2. Backend generates Helm values dynamically
3. Helm installs WordPress (WooCommerce) chart
4. Namespace is created for isolation
5. Reconciler loop monitors deployment status
6. Status updated in PostgreSQL
7. Store becomes accessible via LoadBalancer URL

---

## 🧪 Tested Workflow

* Successfully provisioned WooCommerce store locally
* Installed plugins and created products
* Placed test orders (COD)
* Verified orders in WooCommerce admin
* Clean namespace deletion on store removal

---

## 🔒 RBAC & Security

* Custom ClusterRole for Kubernetes operations
* Scoped permissions for Helm + namespace lifecycle
* Secrets managed via Kubernetes manifests

---

## 📈 Future Improvements

* Ingress + custom domain per store
* Horizontal scaling of backend
* Multi-cluster provisioning
* Observability (Prometheus + Grafana)
* Authentication & role-based access

---

## 👨‍💻 Author

**Aaryan Agarwal**
B.Tech Electrical Engineering, DTU
Focus: Kubernetes, Distributed Systems, and Autonomous Platforms

---

## 📄 License

This project is for educational and research purposes, demonstrating Kubernetes-native infrastructure orchestration and full-stack platform engineering.
