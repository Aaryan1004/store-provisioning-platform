import { Router, Request, Response } from "express";
import { coreV1Api } from "../utils/k8sClient";

const router = Router();

/**
 * GET /k8s/namespaces
 * Lists all namespaces in the cluster
 */
router.get("/namespaces", async (_req: Request, res: Response) => {
  try {
    const namespaceList = await coreV1Api.listNamespace();

    const namespaces = namespaceList.items
      .map(ns => ns.metadata?.name)
      .filter((name): name is string => Boolean(name)); // 🔒 type-safe filter

    res.json({
      count: namespaces.length,
      namespaces,
    });
  } catch (err) {
    console.error("Failed to list namespaces", err);
    res.status(500).json({ error: "Unable to list namespaces" });
  }
});

export default router;
