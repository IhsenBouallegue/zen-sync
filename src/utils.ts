import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export function generateMachineId(): string {
  const crypto = require("node:crypto");
  return crypto.randomUUID();
}

export function getMachineName(): string {
  return os.hostname() || "Unknown";
}

export function generateBackupId(): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15); // YYYYMMDD-HHMMSS
  const machineName = getMachineName()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  return `${timestamp}-${machineName}`;
}



export function autoDetectPaths(): string {
  const home = os.homedir();
  switch (os.platform()) {
    case "win32": {
      // Windows: use roaming path (where profiles.ini is located)
      const appData = process.env.APPDATA || "";
      return path.join(appData, "zen");
    }
    case "darwin": {
      // macOS only has one location for Firefox-based browsers
      return path.join(home, "Library", "Application Support", "zen");
    }
    default: {
      // Linux typically uses one location
      return path.join(home, ".config", "zen-browser");
    }
  }
}
