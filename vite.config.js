import { defineConfig } from "vite";

// GitHub Pages serves the project at /koothambalam/; set BASE_PATH=/ to build for a domain root.
// `vite preview` gets the same base so the built site is tested exactly as it will be served.
export default defineConfig(({ command, isPreview }) => ({
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
