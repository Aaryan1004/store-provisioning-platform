export default function StatusBadge({ status }: { status: string }) {
  const colors: any = {
    provisioning: "orange",
    ready: "green",
    failed: "red",
    deleted: "gray",
  };

  return (
    <span style={{ color: colors[status] || "black" }}>
      {status.toUpperCase()}
    </span>
  );
}
