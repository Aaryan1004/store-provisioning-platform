import { useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

export default function CreateStorePage() {
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!name) return;

    await api.post("/stores", { name });
    navigate("/");
  };

  return (
    <div>
      <h2>Create New Store</h2>
      <input
        placeholder="Store Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button onClick={handleSubmit}>Create</button>
    </div>
  );
}
