// Prepares the Android project for background reminders:
// 1. copies the anchor sound into res/raw so notifications can play it
// 2. adds the permissions needed for exact, scheduled notifications
const fs = require("fs");
const path = require("path");

const androidMain = path.join(__dirname, "android", "app", "src", "main");
if (!fs.existsSync(androidMain)) {
  console.error("Android project not found. Run: npx cap add android");
  process.exit(1);
}

const rawDir = path.join(androidMain, "res", "raw");
fs.mkdirSync(rawDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, "www", "chime.mp3"), path.join(rawDir, "chime.mp3"));
console.log("Copied chime.mp3 to res/raw");

const manifestPath = path.join(androidMain, "AndroidManifest.xml");
let manifest = fs.readFileSync(manifestPath, "utf8");
const perms = [
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.SCHEDULE_EXACT_ALARM",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.WAKE_LOCK",
];
let added = 0;
for (const p of perms) {
  if (!manifest.includes(`"${p}"`)) {
    manifest = manifest.replace("</manifest>", `    <uses-permission android:name="${p}" />\n</manifest>`);
    added++;
  }
}
fs.writeFileSync(manifestPath, manifest);
console.log(`Permissions added: ${added}`);
