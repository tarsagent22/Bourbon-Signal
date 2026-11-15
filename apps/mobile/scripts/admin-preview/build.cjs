const { build } = require("esbuild");
const path = require("node:path");
const fs = require("node:fs");

const mobile = path.resolve(__dirname, "../..");
const out = path.join(mobile, "dist/admin-preview");
const fixture = path.join(__dirname, "fixture.tsx");

async function main() {
  fs.mkdirSync(out, { recursive: true });
  await build({
    entryPoints: [path.join(__dirname, "entry.tsx")],
    outfile: path.join(out, "app.js"),
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', __DEV__: "true" },
    plugins: [{
      name: "offline-admin",
      setup(builder) {
        builder.onResolve({ filter: /^react-native$/ }, () => ({
          path: require.resolve("react-native-web", { paths: [mobile] }),
        }));
        builder.onResolve({ filter: /^expo-crypto$|\/hooks\/useMobileApi$|\/components\/CellarBottleArtwork$/ }, () => ({
          path: fixture,
        }));
      },
    }],
  });
  fs.copyFileSync(
    require.resolve("@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf", { paths: [mobile] }),
    path.join(out, "fraunces.ttf"),
  );
  fs.writeFileSync(path.join(out, "index.html"), [
    '<!doctype html><html lang="en"><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>Admin fixture</title>",
    '<style>@font-face{font-family:Fraunces_700Bold;src:url(fraunces.ttf)}',
    "html,body,#root{height:100%;margin:0;background:#0b0a09}*{box-sizing:border-box}</style>",
    '<div id="root"></div><script src="app.js"></script></html>',
  ].join(""));
  console.log(out);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
