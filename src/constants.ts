import type { ConfigData } from "./types.js";

export const CONFIG_FILE = "zen_nas_config.json";

// Sync categories with their file patterns
export const SYNC_CATEGORIES: Record<string, string[]> = {
  "📁 Profile Configuration": [
    "profiles.ini",
    "installs.ini",
    "compatibility.ini",
  ],
  "🗃️ Profile Groups": ["Profile Groups/**/*.sqlite"],
  "📚 Bookmarks": ["**/places.sqlite", "**/bookmarks.html"],
  "🔒 Passwords & Certificates": [
    "**/key4.db",
    "**/cert9.db",
    "**/logins.json",
  ],
  "🧩 Extensions": ["**/extensions.json", "**/extension-*.json"],
  "🎨 Themes & CSS": [
    "**/zen-*.json",
    "**/zen-*.css",
    "**/userChrome.css",
    "**/userContent.css",
  ],
  "⚙️ Browser Preferences": ["**/prefs.js", "**/user.js"],
  "🔍 Search Settings": ["**/search.json.mozlz4"],
  "🖼️ Favicons": ["**/favicons.sqlite"],
  "📂 Chrome Customizations": ["chrome/**/*"],
};

export const DEFAULT_CONFIG: ConfigData = {
  nas: { destination_path: "" },
  sync: {
    zen_roaming_path: "",
    zen_local_path: "",
    sync_cache_data: false,
    categories: Object.keys(SYNC_CATEGORIES), // All categories enabled by default
    exclude: [
      // Cache and temporary files
      "cache2/**",
      "thumbnails/**",
      "shader-cache/**",
      "startupCache/**",
      "offlineCache/**",
      "weave/cache/**",

      // Logs and crash reports
      "logs/**",
      "crashes/**",
      "minidumps/**",
      "datareporting/**",

      // Lock files
      "**/*.lock",
      "**/*.lck",
      "parent.lock",
      ".parentlock",

      // Temporary storage and session data
      "storage/temporary/**",
      "storage/**/ls/**",
      "storage/default/**/cache/**",
      "sessionstore.jsonlz4",
      "sessionstore-backups/**",
      "sessionCheckpoints.json",
      "recovery.jsonlz4",

      // Cookies and temporary browsing data (session-based)
      "cookies.sqlite*",
      "webappsstore.sqlite*",
      "safebrowsing/**",

      // Network cache and temp files
      "OfflineCache/**",
      "gmp-*/**",
      "saved-telemetry-pings/**",
      "security_state/**",

      // Developer tools and debugging
      "storage/permanent/chrome/idb/**",
      "**/temp/**",
      "**/*.tmp",
      "**/*.temp",

      // Firefox-specific temporary files
      "compatibility.ini",
      "times.json",
      "Telemetry.ShutdownTime.txt",
      "TelemetryStartupCache.tmp",
    ],
  },
  state: {},
};
