import React from "react";
import { createRoot } from "react-dom/client";
if (/^\/next\/?$/.test(window.location.pathname)) {
  import("./next/CoverageApp.jsx").then(({ default: CoverageApp }) =>
    createRoot(document.getElementById("root")).render(<CoverageApp />),
  );
} else {
  // Original V1 module retains its exact rendering behavior and source bytes.
  import("./src.jsx");
}
