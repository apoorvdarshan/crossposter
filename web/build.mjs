import { cp, mkdir, rm } from "node:fs/promises";

const outputDirectory = new URL("./dist/", import.meta.url);
const staticEntries = [
  "app.js",
  "assets",
  "index.html",
  "robots.txt",
  "sitemap.xml",
  "styles.css",
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await Promise.all(
  staticEntries.map((entry) =>
    cp(new URL(entry, import.meta.url), new URL(entry, outputDirectory), {
      recursive: true,
    }),
  ),
);

