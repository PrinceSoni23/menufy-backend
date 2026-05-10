const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const uploads = path.join(root, "uploads");
const images = path.join(uploads, "images");
const models = path.join(uploads, "3d-models");

function removeFilesInDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const fp = path.join(dir, f);
    try {
      const stat = fs.statSync(fp);
      if (stat.isFile()) {
        fs.unlinkSync(fp);
        console.log("Deleted", fp);
      } else if (stat.isDirectory()) {
        // recursive
        removeFilesInDir(fp);
        try {
          fs.rmdirSync(fp);
        } catch (e) {}
      }
    } catch (e) {
      console.error("Failed to remove", fp, e);
    }
  });
}

console.log("Clearing uploads in:");
console.log(" -", images);
console.log(" -", models);

removeFilesInDir(images);
removeFilesInDir(models);

console.log("Done.");
