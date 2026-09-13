import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { MaterialPreviewPage } from "./features/knowledge/MaterialPreviewPage.jsx";
import { getMaterialIdFromHash, materialDemo } from "./features/knowledge/materialDemo.js";
import "./styles.css";

function readPreviewMaterial() {
  const materialId = getMaterialIdFromHash();
  if (!materialId) return null;
  const stored = window.sessionStorage.getItem(`refind-material:${materialId}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      window.sessionStorage.removeItem(`refind-material:${materialId}`);
    }
  }
  return materialDemo.find((material) => material.id === materialId);
}

function RefindRoot() {
  const [previewMaterial, setPreviewMaterial] = React.useState(readPreviewMaterial);

  React.useEffect(() => {
    const updateRoute = () => setPreviewMaterial(readPreviewMaterial());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  return previewMaterial || getMaterialIdFromHash()
    ? <MaterialPreviewPage material={previewMaterial} />
    : <App />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RefindRoot />
  </React.StrictMode>,
);
