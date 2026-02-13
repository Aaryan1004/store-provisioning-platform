import { useEffect, useState } from "react";
import { api } from "../api";
import StoreTable from "../components/StoreTable";

export default function StoresPage() {
  const [stores, setStores] = useState<any[]>([]);

  const fetchStores = async () => {
    const res = await api.get("/stores");
    setStores(res.data.stores);
  };

  useEffect(() => {
    fetchStores();
    const interval = setInterval(fetchStores, 5000);
    return () => clearInterval(interval);
  }, []);

  return <StoreTable stores={stores} refresh={fetchStores} />;
}
