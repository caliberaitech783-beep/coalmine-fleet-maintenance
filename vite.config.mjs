import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll("\\", "/");
          if (moduleId.includes("/node_modules/lucide-react/")) return "icons";
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(moduleId)) return "react-vendor";
          if (moduleId.includes("/node_modules/jspdf/")) return "pdf-vendor";
          if (moduleId.includes("/node_modules/html-to-image/")) return "image-export-vendor";
          if (moduleId.includes("/node_modules/rrweb/")) return "replay-vendor";
          return undefined;
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
