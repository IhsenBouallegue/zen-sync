import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import type { ZenNasConfig } from "./config.js";
import { SYNC_CATEGORIES } from "./constants.js";
import type { SyncMetadata } from "./types.js";
import { generateBackupId, getMachineName } from "./utils.js";

export async function createSyncMetadata(
  config: ZenNasConfig,
  syncType: "upload" | "download" | "sync",
  fileCount: number,
  backupPath: string,
): Promise<SyncMetadata> {
  await config.ensureMachineId();

  const backupId = generateBackupId();

  return {
    backupId,
    machineId: config.data.state.machineId!,
    machineName: getMachineName(),
    platform: process.platform,
    timestamp: new Date().toISOString(),
    syncType,
    categories: config.data.sync.categories || Object.keys(SYNC_CATEGORIES),
    fileCount,
    backupPath,
  };
}

export async function saveMetadata(destPath: string, metadata: SyncMetadata) {
  const metadataPath = path.join(destPath, ".zen-sync-metadata.json");
  const existingMetadata: SyncMetadata[] = [];

  try {
    const fs = require("node:fs");
    if (fs.existsSync(metadataPath)) {
      const content = await readFile(metadataPath, "utf-8");
      existingMetadata.push(...JSON.parse(content));
    }
  } catch (error) {
    console.log(
      chalk.yellow("Could not read existing metadata, creating new file"),
    );
  }

  existingMetadata.push(metadata);

  // Keep only the last 50 entries to avoid the file getting too large
  const recentMetadata = existingMetadata.slice(-50);

  await writeFile(metadataPath, JSON.stringify(recentMetadata, null, 2));
  console.log(
    chalk.blue(`✓ Metadata saved (${recentMetadata.length} entries)`),
  );
}

export async function getLatestBackupPath(
  config: ZenNasConfig,
): Promise<string | null> {
  const base = config.data.nas.destination_path;
  const metadataPath = path.join(base, ".zen-sync-metadata.json");

  try {
    const fs = require("node:fs");
    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    const content = await readFile(metadataPath, "utf-8");
    const metadata: SyncMetadata[] = JSON.parse(content);

    const uploads = metadata.filter((m) => m.syncType === "upload");
    if (uploads.length === 0) {
      return null;
    }

    // Return the most recent upload - reconstruct full path from backup ID
    const latest = uploads[uploads.length - 1];
    const backupId = latest?.backupPath;
    if (!backupId) return null;
    
    // Reconstruct full path from backup ID
    return path.join(config.data.nas.destination_path, backupId);
  } catch (error) {
    return null;
  }
}
