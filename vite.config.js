import { defineConfig } from "vite";
import { resolve } from "path";

// Get repository name from package.json or environment variables
// This will help with proper base path configuration for GitHub Pages
const getRepoName = () => {
  try {
    // You may need to adjust this based on your GitHub repo name
    return "/Homonculus_Lab4/";
  } catch (e) {
    return "/";
  }
};

export default defineConfig({
  base: process.env.NODE_ENV === "production" ? getRepoName() : "/",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    copyPublicDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        // If you have a specific HTML file that loads main_v2.js, specify it here
        // Otherwise, make sure your index.html references ./js/main_v2.js correctly
      },
    },
  },
});
