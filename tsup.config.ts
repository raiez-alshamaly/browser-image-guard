import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // browser-image-compression, file-type, and heic2any stay external — they're
  // (peer) dependencies the consumer provides, not bundled into this package.
});
