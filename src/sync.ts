import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import chalk from "chalk";
import enquirer from "enquirer";
import { logger } from './logger.js';
import { backupPath } from "./backup.js";
import type { ZenNasConfig } from "./config.js";
import { SYNC_CATEGORIES } from "./constants.js";
import {
  createSyncMetadata,
  getLatestBackupPath,
  saveMetadata,
} from "./metadata.js";
import type { SyncMetadata } from "./types.js";
import { generateBackupId } from "./utils.js";

export async function uploadToNas(config: ZenNasConfig) {
  console.log(chalk.bold.cyan("\n🔄 Uploading to NAS..."));
  
  const selectedCategories =
    config.data.sync.categories || Object.keys(SYNC_CATEGORIES);
  const base = config.data.nas.destination_path;

  // Create unique backup folder
  const backupId = generateBackupId();
  const backupFolderPath = path.join(base, backupId);

  console.log(chalk.cyan(`Creating backup: ${backupId}`));
  logger.debug(`Uploading to: ${backupFolderPath}`);

  let totalFiles = 0;
  const syncPath = config.data.sync.sync_path;

  // Debug: Check if sync path is configured
  if (!syncPath) {
    console.log(chalk.red("❌ No sync path configured!"));
    console.log(chalk.yellow("Please configure NAS & Paths first."));
    return;
  }

  console.log(chalk.cyan(`Source path: ${syncPath}`));
  console.log(
    chalk.blue(`📱 Backing up Zen Browser profile (${os.platform()})`),
  );
  
  // Backup the profile path (roaming data on Windows, single location on macOS/Linux)
  totalFiles += await backupPath(
    syncPath,
    path.join(backupFolderPath, "profile"),
    config.data.sync.exclude,
    false, // not dry run
    false, // no cleanup for upload
    selectedCategories,
  );

  // Save metadata
  const metadata = await createSyncMetadata(
    config,
    "upload",
    totalFiles,
    backupId,
  );
  
  await saveMetadata(base, metadata);

  console.log(
    chalk.green(`✅ Upload completed successfully! Backup ID: ${backupId}`),
  );
  
  logger.info(`Uploaded ${totalFiles} files`);

  // Platform-specific completion summary
  console.log(
    chalk.gray(`   📱 Profile synced: ✅ (${os.platform()})`),
  );
}

export async function selectBackupForDownload(
  config: ZenNasConfig,
): Promise<string | null> {
  const base = config.data.nas.destination_path;
  const metadataPath = path.join(base, ".zen-sync-metadata.json");

  logger.verbose(`Looking for metadata at: ${metadataPath}`);

  try {
    const fs = require("node:fs");
    if (!fs.existsSync(metadataPath)) {
      console.log(chalk.yellow("No backup history found."));
      logger.debug(`Metadata file does not exist: ${metadataPath}`);
      return null;
    }

    const content = await readFile(metadataPath, "utf-8");
    const metadata: SyncMetadata[] = JSON.parse(content);

    logger.verbose(`Found ${metadata.length} total metadata entries`);
    logger.debug(`Raw metadata:`, metadata);

    const uploads = metadata.filter((m) => m.syncType === "upload").slice(-10); // Last 10 uploads

    logger.verbose(`Found ${uploads.length} upload entries (showing last 10)`);

    if (uploads.length === 0) {
      console.log(chalk.yellow("No uploads found."));
      return null;
    }

    const choices = uploads.map((entry, index) => ({
      name: `${index + 1}. ${entry.backupId} - ${new Date(entry.timestamp).toLocaleString()} (${entry.machineName})`,
      value: entry.backupId, // Go back to using backup ID directly
    }));

    logger.debug(`Created ${choices.length} choices for selection`);
    choices.forEach((choice, i) => {
      logger.debug(`Choice ${i}: name="${choice.name}", value="${choice.value}"`);
    });

    const response = await enquirer.prompt({
      type: "select",
      name: "selectedBackup",
      message: "Select backup to download:",
      choices: choices,
    }) as { selectedBackup: string };

    logger.debug(`Enquirer returned: "${response.selectedBackup}" (type: ${typeof response.selectedBackup})`);
    
    // Handle case where enquirer returns the display name instead of value
    let selectedBackupId = response.selectedBackup;
    
    // If the response contains " - " it means we got the display name, extract the backup ID
    if (selectedBackupId.includes(' - ')) {
      const extractedId = selectedBackupId.split(' - ')[0].replace(/^\d+\.\s*/, ''); // Remove number prefix and extract ID
      logger.warn(`Got display name, extracting backup ID: "${extractedId}"`);
      selectedBackupId = extractedId;
    }
    
    // Verify the backup ID exists in our uploads
    const foundBackup = uploads.find(u => u.backupId === selectedBackupId);
    if (!foundBackup) {
      logger.error(`Selected backup ID "${selectedBackupId}" not found in uploads`);
      console.log(chalk.red("Selected backup not found."));
      return null;
    }
    
    logger.debug(`Final selected backup: ${selectedBackupId}`);
    return selectedBackupId;
  } catch (error) {
    console.error(chalk.red("Error reading backup list:"), error);
    logger.error(`Failed to read backup list:`, error);
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

  logger.verbose(`Selected backup ID: ${selectedBackupId}`);

  // Reconstruct full backup path from backup ID
  let selectedBackupPath = path.join(base, selectedBackupId);
  logger.verbose(`Reconstructed backup path: ${selectedBackupPath}`);

  const fs = require("node:fs");

  // Fallback mechanism if backup path doesn't exist
  if (!fs.existsSync(selectedBackupPath)) {
    try {
      const nasContents = fs.readdirSync(base);
      const backupIdPart = selectedBackupId.split('-').slice(0, 2).join('-');
      const possibleMatches = nasContents.filter((item: string) => 
        item.includes(backupIdPart) && fs.statSync(path.join(base, item)).isDirectory()
      );
      
      if (possibleMatches.length > 0) {
        selectedBackupPath = path.join(base, possibleMatches[0]);
        logger.info(`Found backup folder: ${possibleMatches[0]}`);
      }
    } catch (error) {
      logger.error(`Failed to search backup folders:`, error);
    }
  }

  // Define backup source paths
  const roamingSource = path.join(selectedBackupPath, "roaming");
  const localSource = path.join(selectedBackupPath, "local");
  const profileSource = path.join(selectedBackupPath, "profile");

  // Final check - if still not found, error out
  if (!fs.existsSync(selectedBackupPath)) {
    console.log(chalk.red(`Backup folder not found: ${selectedBackupPath}`));
    return;
  }

  const syncPath = config.data.sync.sync_path;

  let totalFiles = 0;

  console.log(
    chalk.cyan(`Downloading from: ${path.basename(selectedBackupPath)}`),
  );

  // Download profile data (roaming data on Windows, single location on macOS/Linux)
  if (fs.existsSync(profileSource)) {
    console.log(chalk.blue("📱 Restoring profile data"));
    
    totalFiles += await backupPath(
      profileSource,
      syncPath,
      [], // no excludes for download
      false, // not dry run
      true, // cleanup local files not in NAS
    );
  } else if (fs.existsSync(roamingSource)) {
    // Fallback: try roaming folder if profile doesn't exist (older backup format)
    console.log(
      chalk.yellow("⚠️ Using roaming folder as fallback"),
    );
    
    totalFiles += await backupPath(
      roamingSource,
      syncPath,
      [], // no excludes for download
      false, // not dry run
      true, // cleanup local files not in NAS
    );
  } else {
    console.log(chalk.red("Selected backup data not found"));
    return;
  }

  // Save metadata
  const metadata = await createSyncMetadata(
    config,
    "download",
    totalFiles,
    selectedBackupId,
  );
  
  await saveMetadata(base, metadata);

  console.log(chalk.green("✅ Download completed successfully!"));
  logger.info(`Downloaded ${totalFiles} files`);
}

export async function smartSync(config: ZenNasConfig) {
  console.log(chalk.bold.cyan("\n🔄 Performing smart sync..."));
  const base = config.data.nas.destination_path;
  const fs = require("node:fs");

  const smartSyncPath = config.data.sync.sync_path;

  // Check what exists based on platform structure
  let hasNasData = false;

  // Look for existing backups - check both "profile" folder and fallback to "roaming"
  const latestBackup = await getLatestBackupPath(config);
  if (latestBackup) {
    const profileNas = path.join(latestBackup, "profile");
    const roamingFallback = path.join(latestBackup, "roaming");
    hasNasData = fs.existsSync(profileNas) || fs.existsSync(roamingFallback);
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

  console.log(chalk.blue("📱 Smart sync for profile data"));
  // Sync with the latest backup
  if (latestBackup) {
    const profileNas = path.join(latestBackup, "profile");
    const sourceNas = fs.existsSync(profileNas)
      ? profileNas
      : path.join(latestBackup, "roaming");

    // Bidirectional sync without cleanup
    totalFiles += await backupPath(
      smartSyncPath,
      sourceNas,
      config.data.sync.exclude,
      false,
      false, // no cleanup to preserve existing files
      selectedCategories,
    );

    totalFiles += await backupPath(
      sourceNas,
      smartSyncPath,
      [],
      false,
      false, // no cleanup to preserve existing files
    );
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
