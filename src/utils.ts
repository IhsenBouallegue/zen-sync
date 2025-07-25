import os from "node:os";
import path from "node:path";
import type { ZenPaths } from "./types.js";

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

export function pathsAreSame(path1: string, path2: string): boolean {
  return path.resolve(path1) === path.resolve(path2);
}

export function autoDetectPaths(): ZenPaths {
  const home = os.homedir();
  switch (os.platform()) {
    case "win32": {
      const appData = process.env.APPDATA || "";
      const localAppData = process.env.LOCALAPPDATA || "";
      return {
        roaming: path.join(appData, "zen"),
        local: path.join(localAppData, "zen"),
        hasSeparatePaths: true,
      };
    }
    case "darwin": {
      // macOS only has one location for Firefox-based browsers
      const zenPath = path.join(home, "Library", "Application Support", "zen");
      return {
        roaming: zenPath,
        local: zenPath,
        hasSeparatePaths: false,
      };
    }
    default: {
      // Linux typically uses one location
      const zenPath = path.join(home, ".config", "zen-browser");
      return {
        roaming: zenPath,
        local: zenPath,
        hasSeparatePaths: false,
      };
    }
  }
}
