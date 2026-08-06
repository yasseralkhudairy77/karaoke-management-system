const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "public");

const files = ["index.html", "tv-display.html"];
const directories = ["css", "js", "assets"];

function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  const destination = path.join(outputDir, relativePath);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing required static file: ${relativePath}`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirectory(relativePath) {
  const source = path.join(root, relativePath);
  const destination = path.join(outputDir, relativePath);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing required static directory: ${relativePath}`);
  }

  fs.cpSync(source, destination, { recursive: true });
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

files.forEach(copyFile);
directories.forEach(copyDirectory);
fs.writeFileSync(path.join(outputDir, ".nojekyll"), "");

console.log("Static frontend prepared in public/");
