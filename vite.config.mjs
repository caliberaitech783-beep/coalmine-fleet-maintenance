import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function vendorChunkName(id) {
  const moduleId = id.replaceAll("\\", "/");
  if (moduleId.includes("/node_modules/lucide-react/")) return "icons";
  if (/\/node_modules\/(react|react-dom|scheduler)\//.test(moduleId)) return "react-vendor";
  if (moduleId.includes("/node_modules/jspdf/")) return "pdf-vendor";
  if (moduleId.includes("/node_modules/html-to-image/")) return "image-export-vendor";
  if (moduleId.includes("/node_modules/rrweb/")) return "replay-vendor";
  return null;
}

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Vite's chunk preload helper is needed by the entry on every page.
            // Vendor groups also capture their dependencies, so without this
            // higher-priority group the helper was pulled into pdf-vendor and
            // every visit downloaded the 400 KB PDF library up front.
            { name: "preload-helper", test: /vite[\\/]preload-helper/, priority: 2 },
            { name: vendorChunkName, priority: 1 },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
