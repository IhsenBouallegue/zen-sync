import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import chalk from "chalk";
import enquirer from "enquirer";
import { backupPath } from "./backup.js";
import type { ZenNasConfig } from "./config.js";
import { SYNC_CATEGORIES } from "./constants.js";
import {
  createSyncMetadata,
  getLatestBackupPath,
  saveMetadata,
} from "./metadata.js";
import type { SyncMetadata } from "./types.js";
import { generateBackupId, pathsAreSame } from "./utils.js";

export async function uploadToNas(config: ZenNasConfig) {
  console.log(chalk.bold.cyan("\n🔄 Uploading to NAS..."));
  const selectedCategories =
    config.data.sync.categories || Object.keys(SYNC_CATEGORIES);
  const base = config.data.nas.destination_path;

  // Create unique backup folder
  const backupId = generateBackupId();
  const backupFolderPath = path.join(base, backupId);

  console.log(chalk.cyan(`Creating backup: ${backupId}`));

  let totalFiles = 0;
  const roamingPath = config.data.sync.zen_roaming_path;
  const localPath = config.data.sync.zen_local_path;
  const samePaths = pathsAreSame(roamingPath, localPath);

  if (samePaths) {
    console.log(
      chalk.blue("📱 Single profile location detected (macOS/Linux style)"),
    );
    // Only backup once since both paths are the same
    totalFiles += await backupPath(
      roamingPath,
      path.join(backupFolderPath, "profile"),
      config.data.sync.exclude,
      false, // not dry run
      false, // no cleanup for upload
      selectedCategories,
    );
  } else {
    console.log(
      chalk.blue("💻 Windows dual-path detected - prioritizing roaming data"),
    );

    // ROAMING DATA (Priority: High) - Contains user preferences, bookmarks, passwords
    console.log(
      chalk.cyan(
        "  📂 Backing up roaming data (user preferences, bookmarks, passwords)",
      ),
    );
    totalFiles += await backupPath(
      roamingPath,
      path.join(backupFolderPath, "roaming"),
      config.data.sync.exclude,
      false, // not dry run
      false, // no cleanup for upload
      selectedCategories,
    );

    // LOCAL DATA (Priority: Lower) - Contains cache and machine-specific data
    // Only backup if it contains important files not in roaming
    const fs = require("node:fs");
    if (fs.existsSync(localPath)) {
      console.log(
        chalk.gray(
          "  💾 Backing up local data (cache and machine-specific files)",
        ),
      );
      totalFiles += await backupPath(
        localPath,
        path.join(backupFolderPath, "local"),
        [
          ...config.data.sync.exclude,
          // Additional exclusions for local data since it's mostly cache
          "cache/**",
          "Cache/**",
          "CacheStorage/**",
          "GPUCache/**",
          "Service Worker/**",
          "Code Cache/**",
          "DawnCache/**",
        ],
        false, // not dry run
        false, // no cleanup for upload
        selectedCategories,
      );
    } else {
      console.log(chalk.gray("  ⚠️ Local data path doesn't exist, skipping"));
    }
  }

  // Save metadata
  const metadata = await createSyncMetadata(
    config,
    "upload",
    totalFiles,
    backupId, // Store relative backup ID instead of full path
  );
  await saveMetadata(base, metadata);

  console.log(
    chalk.green(`✅ Upload completed successfully! Backup ID: ${backupId}`),
  );

  // Platform-specific completion summary
  if (samePaths) {
    console.log(
      chalk.gray(`   📱 Single profile location synced (${os.platform()})`),
    );
  } else {
    console.log(
      chalk.gray(`   📂 Roaming data synced: ✅ (essential user data)`),
    );
    console.log(
      chalk.gray(`   💾 Local data synced: ✅ (supplementary cache files)`),
    );
  }
}

export async function selectBackupForDownload(
  config: ZenNasConfig,
): Promise<string | null> {
  const base = config.data.nas.destination_path;
  const metadataPath = path.join(base, ".zen-sync-metadata.json");

  try {
    const fs = require("node:fs");
    if (!fs.existsSync(metadataPath)) {
      console.log(chalk.yellow("No backup history found."));
      return null;
    }

    const content = await readFile(metadataPath, "utf-8");
    const metadata: SyncMetadata[] = JSON.parse(content);

    const uploads = metadata.filter((m) => m.syncType === "upload").slice(-10); // Last 10 uploads

    if (uploads.length === 0) {
      console.log(chalk.yellow("No uploads found."));
      return null;
    }

    const choices = uploads.map((entry) => ({
      name: `${entry.backupId} - ${new Date(entry.timestamp).toLocaleString()} (${entry.machineName})`,
      value: entry.backupPath, // This is now just the backup ID
    }));

    const { selectedBackup } = (await enquirer.prompt({
      type: "select",
      name: "selectedBackup",
      message: "Select backup to download:",
      choices: choices,
    })) as { selectedBackup: string };

    return selectedBackup;
  } catch (error) {
    console.error(chalk.red("Error reading backup list:"), error);
    return null;
  }
}

export async function downloadFromNas(config: ZenNasConfig) {
  console.log(chalk.bold.cyan("\n⬇️ Downloading from NAS..."));
  const base = config.data.nas.destination_path;

  // Select which backup to download
  const selectedBackupId = await selectBackupForDownload(config);
  if (!selectedBackupId) {
    console.log(chalk.red("No backup selected or available."));
    return;
  }

  // Reconstruct full backup path from backup ID
  const selectedBackupPath = path.join(base, selectedBackupId);

  // Check if selected backup exists
  const fs = require("node:fs");
  const roamingSource = path.join(selectedBackupPath, "roaming");
  const localSource = path.join(selectedBackupPath, "local");
  const profileSource = path.join(selectedBackupPath, "profile");

  const roamingPath = config.data.sync.zen_roaming_path;
  const localPath = config.data.sync.zen_local_path;
  const samePaths = pathsAreSame(roamingPath, localPath);

  let totalFiles = 0;

  console.log(
    chalk.cyan(`Downloading from: ${path.basename(selectedBackupPath)}`),
  );

  if (samePaths) {
    // Single profile location (macOS/Linux style)
    if (fs.existsSync(profileSource)) {
      console.log(chalk.blue("📱 Restoring single profile location"));
      totalFiles += await backupPath(
        profileSource,
        roamingPath,
        [], // no excludes for download
        false, // not dry run
        true, // cleanup local files not in NAS
      );
    } else if (fs.existsSync(roamingSource)) {
      // Fallback: try roaming folder if profile doesn't exist (older backup format)
      console.log(
        chalk.yellow("⚠️ Using roaming folder as fallback for single profile"),
      );
      totalFiles += await backupPath(
        roamingSource,
        roamingPath,
        [], // no excludes for download
        false, // not dry run
        true, // cleanup local files not in NAS
      );
    } else {
      console.log(chalk.red("Selected backup data not found"));
      return;
    }
  } else {
    // Separate profile locations (Windows style)
    console.log(chalk.blue("💻 Restoring separate profile locations"));

    if (!fs.existsSync(roamingSource)) {
      console.log(chalk.red("Selected backup data not found"));
      return;
    }

    // Download roaming data
    totalFiles += await backupPath(
      roamingSource,
      roamingPath,
      [], // no excludes for download
      false, // not dry run
      true, // cleanup local files not in NAS
    );

    // Download local data if it exists
    if (fs.existsSync(localSource)) {
      totalFiles += await backupPath(
        localSource,
        localPath,
        [], // no excludes for download
        false, // not dry run
        true, // cleanup local files not in NAS
      );
    }
  }

  // Save metadata
  const metadata = await createSyncMetadata(
    config,
    "download",
    totalFiles,
    selectedBackupId, // Store relative backup ID instead of full path
  );
  await saveMetadata(base, metadata);

  console.log(chalk.green("✅ Download completed successfully!"));
}

export async function smartSync(config: ZenNasConfig) {
  console.log(chalk.bold.cyan("\n🔄 Performing smart sync..."));
  const base = config.data.nas.destination_path;
  const fs = require("node:fs");

  const roamingPath = config.data.sync.zen_roaming_path;
  const localPath = config.data.sync.zen_local_path;
  const samePaths = pathsAreSame(roamingPath, localPath);

  // Check what exists based on platform structure
  let hasNasData = false;
  const roamingNas = path.join(base, "roaming");
  const localNas = path.join(base, "local");

  if (samePaths) {
    // Look for existing backups - check both "profile" folder and fallback to "roaming"
    const latestBackup = await getLatestBackupPath(config);
    if (latestBackup) {
      const profileNas = path.join(latestBackup, "profile");
      const roamingFallback = path.join(latestBackup, "roaming");
      hasNasData = fs.existsSync(profileNas) || fs.existsSync(roamingFallback);
    }
  } else {
    hasNasData = fs.existsSync(roamingNas);
  }

  if (!hasNasData) {
    console.log(
      chalk.yellow("No existing NAS data found. Performing upload instead..."),
    );
    await uploadToNas(config);
    return;
  }

  console.log(chalk.cyan("Analyzing local and remote changes..."));

  // For smart sync, we'll use a strategy where:
  // 1. Never delete existing files
  // 2. Copy newer files from both directions
  // 3. Preserve both versions if conflict detected

  let totalFiles = 0;
  const selectedCategories =
    config.data.sync.categories || Object.keys(SYNC_CATEGORIES);

  if (samePaths) {
    console.log(chalk.blue("📱 Smart sync for single profile location"));
    // For single location, we'll sync with the latest backup
    const latestBackup = await getLatestBackupPath(config);
    if (latestBackup) {
      const profileNas = path.join(latestBackup, "profile");
      const sourceNas = fs.existsSync(profileNas)
        ? profileNas
        : path.join(latestBackup, "roaming");

      // Bidirectional sync without cleanup
      totalFiles += await backupPath(
        roamingPath,
        sourceNas,
        config.data.sync.exclude,
        false,
        false, // no cleanup to preserve existing files
        selectedCategories,
      );

      totalFiles += await backupPath(
        sourceNas,
        roamingPath,
        [],
        false,
        false, // no cleanup to preserve existing files
      );
    }
  } else {
    console.log(chalk.blue("💻 Smart sync for separate profile locations"));
    // Sync roaming: local -> NAS (no cleanup)
    totalFiles += await backupPath(
      roamingPath,
      roamingNas,
      config.data.sync.exclude,
      false,
      false, // no cleanup to preserve existing files
      selectedCategories,
    );

    // Sync roaming: NAS -> local (no cleanup)
    totalFiles += await backupPath(
      roamingNas,
      roamingPath,
      [],
      false,
      false, // no cleanup to preserve existing files
    );

    // Sync local data if it exists
    if (fs.existsSync(localNas)) {
      totalFiles += await backupPath(
        localPath,
        localNas,
        config.data.sync.exclude,
        false,
        false,
        selectedCategories,
      );

      totalFiles += await backupPath(localNas, localPath, [], false, false);
    }
  }

  // Save metadata
  const syncPath = "smart-sync"; // Smart sync doesn't create a specific backup folder
  const metadata = await createSyncMetadata(
    config,
    "sync",
    totalFiles,
    syncPath,
  );
  await saveMetadata(base, metadata);

  console.log(chalk.green("✅ Smart sync completed successfully!"));
}
