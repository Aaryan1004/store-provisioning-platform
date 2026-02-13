import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import StoresPage from "./pages/StoresPage";
import CreateStorePage from "./pages/CreateStorePage";

function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: "20px" }}>
        <h1>Store Provisioning Platform</h1>

        <nav style={{ marginBottom: "20px" }}>
          <Link to="/">Stores</Link> |{" "}
          <Link to="/create">Create Store</Link>
        </nav>

        <Routes>
          <Route path="/" element={<StoresPage />} />
          <Route path="/create" element={<CreateStorePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
