import workboxBuild from "workbox-build";

const buildSW = async () => {
  const { count, size } = await workboxBuild.injectManifest({
    globDirectory: "dist",
    globPatterns: ["**/*.{js,css,ico,png,svg,webmanifest}"],
    swSrc: "src/sw.js",
    swDest: "dist/sw.js",
    modifyURLPrefix: {
      "": "/",
    },
    additionalManifestEntries: [
      { url: "/", revision: new Date().getTime().toString() },
    ],
  });
  console.log(`Service worker generated: ${count} files precached (${size} bytes)`);
};

buildSW().catch(console.error);
