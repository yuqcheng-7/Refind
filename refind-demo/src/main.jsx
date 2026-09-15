import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { MaterialPreviewPage } from "./features/knowledge/MaterialPreviewPage.jsx";
import { getMaterialIdFromHash, materialDemo } from "./features/knowledge/materialDemo.js";
import { getMaterialById } from "./lib/api/materials.js";
import "./styles.css";

function readCachedMaterial(materialId) {
  const stored = window.sessionStorage.getItem(`refind-material:${materialId}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      window.sessionStorage.removeItem(`refind-material:${materialId}`);
    }
  }
  return materialDemo.find((material) => material.id === materialId) || null;
}

function RefindRoot() {
  const [routeId, setRouteId] = React.useState(() => getMaterialIdFromHash());
  const [previewMaterial, setPreviewMaterial] = React.useState(() => {
    const id = getMaterialIdFromHash();
    return id ? readCachedMaterial(id) : null;
  });
  const [previewLoading, setPreviewLoading] = React.useState(() => Boolean(getMaterialIdFromHash()));
  const [previewError, setPreviewError] = React.useState('');

  React.useEffect(() => {
    const updateRoute = () => setRouteId(getMaterialIdFromHash());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  React.useEffect(() => {
    if (!routeId) {
      setPreviewMaterial(null);
      setPreviewLoading(false);
      setPreviewError('');
      return undefined;
    }

    let active = true;
    const cached = readCachedMaterial(routeId);
    if (cached) setPreviewMaterial(cached);
    setPreviewLoading(true);
    setPreviewError('');

    getMaterialById(routeId)
      .then((material) => {
        if (!active) return;
        if (material) {
          setPreviewMaterial(material);
          window.sessionStorage.setItem(`refind-material:${routeId}`, JSON.stringify(material));
        } else if (!cached) {
          setPreviewMaterial(null);
        }
      })
      .catch(() => {
        if (!active) return;
        if (!cached) {
          setPreviewMaterial(null);
          setPreviewError('资料加载失败，请回到知识库后重试。');
        }
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });

    return () => { active = false; };
  }, [routeId]);

  if (routeId) {
    return (
      <MaterialPreviewPage
        material={previewMaterial}
        loading={previewLoading}
        error={previewError}
      />
    );
  }

  return <App />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RefindRoot />
  </React.StrictMode>,
);
