import { defineConfig } from "vite";

// GitHub Pages serves the project at /koothambalam/; set BASE_PATH=/ to build for a domain root.
// `vite preview` gets the same base so the built site is tested exactly as it will be served.
// The 3D version is a single static page at public/3d/index.html. Pages serves /3d/ from that
// folder's index; in dev, Vite would answer /3d/ with the main page, so point it at the file.
const threeDIndex = {
  name: "3d-index",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const m = req.url?.match(/^\/3d\/?(\?.*)?$/);
      if (m) req.url = "/3d/index.html" + (m[1] ?? "");
      next();
    });
  },
};

export default defineConfig(({ command, isPreview }) => ({
  plugins: [threeDIndex],
  base: command === "build" || isPreview ? process.env.BASE_PATH ?? "/koothambalam/" : "/",
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
  build: {
    // main.js awaits the world setup at the top level; every browser that runs the WebGL scene supports that.
    target: "es2022",
  },
}));
