import StatusBadge from "./StatusBadge";
import { api } from "../api";

export default function StoreTable({ stores, refresh }: any) {
  const handleDelete = async (storeId: string) => {
    await api.delete(`/stores/${storeId}`);
    refresh();
  };

  return (
    <table border={1} cellPadding={8}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
          <th>URL</th>
          <th>Created</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {stores.map((store: any) => (
          <tr key={store.storeId}>
            <td>{store.storeName}</td>
            <td>
              <StatusBadge status={store.status} />
            </td>
            <td>
              {store.url && (
                <a href={store.url} target="_blank">
                  Open
                </a>
              )}
            </td>
            <td>{new Date(store.createdAt).toLocaleString()}</td>
            <td>
              <button onClick={() => handleDelete(store.storeId)}>
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
