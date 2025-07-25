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
import { generateBackupId, pathsAreSame } from "./utils.js";

export async function uploadToNas(config: ZenNasConfig) {
  console.log(chalk.bold.cyan("\n🔄 Uploading to NAS..."));
  
  const selectedCategories =
    config.data.sync.categories || Object.keys(SYNC_CATEGORIES);
  const base = config.data.nas.destination_path;

  logger.verbose(`Upload configuration:`);
  logger.verbose(`  NAS destination: ${base}`);
  logger.verbose(`  Selected categories: ${selectedCategories.join(', ')}`);

  // Create unique backup folder
  const backupId = generateBackupId();
  const backupFolderPath = path.join(base, backupId);

  logger.verbose(`Generated backup ID: ${backupId}`);
  logger.verbose(`Backup folder path: ${backupFolderPath}`);

  console.log(chalk.cyan(`Creating backup: ${backupId}`));

  let totalFiles = 0;
  const roamingPath = config.data.sync.zen_roaming_path;
  const localPath = config.data.sync.zen_local_path;
  const samePaths = pathsAreSame(roamingPath, localPath);

  logger.verbose(`Source paths:`);
  logger.verbose(`  Roaming: ${roamingPath}`);
  logger.verbose(`  Local: ${localPath}`);
  logger.verbose(`  Same paths: ${samePaths}`);

  if (samePaths) {
    console.log(
      chalk.blue("📱 Single profile location detected (macOS/Linux style)"),
    );
    logger.verbose(`Uploading single profile location to: ${path.join(backupFolderPath, "profile")}`);
    
    // Only backup once since both paths are the same
    totalFiles += await backupPath(
      roamingPath,
      path.join(backupFolderPath, "profile"),
      config.data.sync.exclude,
      false, // not dry run
      false, // no cleanup for upload
      selectedCategories,
    );
    
    logger.verbose(`Single profile upload completed. Files: ${totalFiles}`);
  } else {
    console.log(
      chalk.blue("💻 Windows dual-path detected - prioritizing roaming data"),
    );
    logger.verbose(`Uploading Windows dual-path structure`);

    // ROAMING DATA (Priority: High) - Contains user preferences, bookmarks, passwords
    console.log(
      chalk.cyan(
        "  📂 Backing up roaming data (user preferences, bookmarks, passwords)",
      ),
    );
    
    const roamingDest = path.join(backupFolderPath, "roaming");
    logger.verbose(`Uploading roaming data: ${roamingPath} -> ${roamingDest}`);
    
    const roamingFiles = await backupPath(
      roamingPath,
      roamingDest,
      config.data.sync.exclude,
      false, // not dry run
      false, // no cleanup for upload
      selectedCategories,
    );
    totalFiles += roamingFiles;
    logger.verbose(`Roaming upload completed. Files: ${roamingFiles}`);

    // LOCAL DATA (Priority: Lower) - Contains cache and machine-specific data
    // Only backup if it contains important files not in roaming
    const fs = require("node:fs");
    if (fs.existsSync(localPath)) {
      console.log(
        chalk.gray(
          "  💾 Backing up local data (cache and machine-specific files)",
        ),
      );
      
      const localDest = path.join(backupFolderPath, "local");
      logger.verbose(`Uploading local data: ${localPath} -> ${localDest}`);
      
      const localExclusions = [
        ...config.data.sync.exclude,
        // Additional exclusions for local data since it's mostly cache
        "cache/**",
        "Cache/**",
        "CacheStorage/**",
        "GPUCache/**",
        "Service Worker/**",
        "Code Cache/**",
        "DawnCache/**",
      ];
      logger.verbose(`Local data exclusions: ${localExclusions.join(', ')}`);
      
      const localFiles = await backupPath(
        localPath,
        localDest,
        localExclusions,
        false, // not dry run
        false, // no cleanup for upload
        selectedCategories,
      );
      totalFiles += localFiles;
      logger.verbose(`Local upload completed. Files: ${localFiles}`);
    } else {
      console.log(chalk.gray("  ⚠️ Local data path doesn't exist, skipping"));
      logger.warn(`Local data path does not exist: ${localPath}`);
    }
  }

  // Save metadata
  const metadata = await createSyncMetadata(
    config,
    "upload",
    totalFiles,
    backupId, // Store relative backup ID instead of full path
  );
  
  logger.verbose(`Created metadata with backupId: ${backupId}`);
  logger.debug(`Metadata:`, metadata);
  await saveMetadata(base, metadata);
  logger.verbose(`Metadata saved to: ${path.join(base, ".zen-sync-metadata.json")}`);

  console.log(
    chalk.green(`✅ Upload completed successfully! Backup ID: ${backupId}`),
  );
  
  logger.info(`Upload summary: ${totalFiles} files uploaded to ${backupFolderPath}`);

  // Platform-specific completion summary
  if (samePaths) {
    console.log(
      chalk.gray(`   📱 Single profile location synced (${os.platform()})`),
    );
    logger.verbose(`Single profile upload completed for ${os.platform()}`);
  } else {
    console.log(
      chalk.gray(`   📂 Roaming data synced: ✅ (essential user data)`),
    );
    console.log(
      chalk.gray(`   💾 Local data synced: ✅ (supplementary cache files)`),
    );
    logger.verbose(`Dual-path upload completed for ${os.platform()}`);
  }
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

    // Log each upload entry for debugging
    uploads.forEach((entry, index) => {
      logger.verbose(`Upload ${index + 1}:`, {
        backupId: entry.backupId,
        backupPath: entry.backupPath,
        timestamp: entry.timestamp,
        machineName: entry.machineName,
      });
      
      // Check if there's a mismatch between backupId and backupPath
      if (entry.backupId !== entry.backupPath) {
        logger.warn(`Backup ID/Path mismatch detected:`, {
          backupId: entry.backupId,
          backupPath: entry.backupPath,
        });
      }
    });

    const choices = uploads.map((entry) => ({
      name: `${entry.backupId} - ${new Date(entry.timestamp).toLocaleString()} (${entry.machineName})`,
      value: entry.backupId, // Use backupId instead of backupPath for consistency
    }));

    logger.debug(`Presenting ${choices.length} choices to user`);

    const { selectedBackup } = (await enquirer.prompt({
      type: "select",
      name: "selectedBackup",
      message: "Select backup to download:",
      choices: choices,
    })) as { selectedBackup: string };

    logger.verbose(`User selected backup: ${selectedBackup}`);
    return selectedBackup;
  } catch (error) {
    console.error(chalk.red("Error reading backup list:"), error);
    logger.error(`Failed to read backup list:`, error);
    return null;
  }
}

export async function downloadFromNas(config: ZenNasConfig) {
  console.log(chalk.bold.cyan("\n⬇️ Downloading from NAS..."));
  const base = config.data.nas.destination_path;

  logger.verbose(`Download configuration:`);
  logger.verbose(`  NAS source: ${base}`);
  logger.verbose(`  Target roaming: ${config.data.sync.zen_roaming_path}`);
  logger.verbose(`  Target local: ${config.data.sync.zen_local_path}`);

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

  // Fallback mechanism for ID/Path mismatch issue
  if (!fs.existsSync(selectedBackupPath)) {
    logger.warn(`Primary backup path doesn't exist: ${selectedBackupPath}`);
    
    // Try to find the backup by looking for similar folder names
    try {
      const nasContents = fs.readdirSync(base);
      logger.verbose(`NAS directory (${base}) contents:`, nasContents);
      
      // Look for folders that contain the selected backup ID or timestamp
      const backupIdPart = selectedBackupId.split('-').slice(0, 2).join('-'); // Get YYYYMMDD-HHMMSS part
      const possibleMatches = nasContents.filter((item: string) => 
        item.includes(backupIdPart) && fs.statSync(path.join(base, item)).isDirectory()
      );
      
      logger.verbose(`Possible backup folder matches:`, possibleMatches);
      
      if (possibleMatches.length > 0) {
        selectedBackupPath = path.join(base, possibleMatches[0]);
        logger.warn(`Using fallback backup path: ${selectedBackupPath}`);
      }
    } catch (error) {
      logger.error(`Failed to list NAS directory contents:`, error);
    }
  }

  // Check if selected backup exists
  const roamingSource = path.join(selectedBackupPath, "roaming");
  const localSource = path.join(selectedBackupPath, "local");
  const profileSource = path.join(selectedBackupPath, "profile");

  logger.verbose(`Checking backup structure:`);
  logger.verbose(`  Main folder: ${selectedBackupPath} - exists: ${fs.existsSync(selectedBackupPath)}`);
  logger.verbose(`  Roaming source: ${roamingSource} - exists: ${fs.existsSync(roamingSource)}`);
  logger.verbose(`  Local source: ${localSource} - exists: ${fs.existsSync(localSource)}`);
  logger.verbose(`  Profile source: ${profileSource} - exists: ${fs.existsSync(profileSource)}`);

  // Final check - if still not found, list directory contents
  if (!fs.existsSync(selectedBackupPath)) {
    logger.error(`Backup folder still not found after fallback attempts`);
    try {
      const nasContents = fs.readdirSync(base);
      logger.error(`Available folders in NAS directory:`, nasContents);
    } catch (error) {
      logger.error(`Failed to list NAS directory contents:`, error);
    }
  }

  const roamingPath = config.data.sync.zen_roaming_path;
  const localPath = config.data.sync.zen_local_path;
  const samePaths = pathsAreSame(roamingPath, localPath);

  logger.verbose(`Download target paths:`);
  logger.verbose(`  Target roaming: ${roamingPath}`);
  logger.verbose(`  Target local: ${localPath}`);
  logger.verbose(`  Same paths: ${samePaths}`);

  let totalFiles = 0;

  console.log(
    chalk.cyan(`Downloading from: ${path.basename(selectedBackupPath)}`),
  );
  logger.verbose(`Starting download from backup: ${selectedBackupPath}`);

  if (samePaths) {
    // Single profile location (macOS/Linux style)
    logger.verbose(`Single profile download - checking sources:`);
    logger.verbose(`  Profile source: ${profileSource} - exists: ${fs.existsSync(profileSource)}`);
    logger.verbose(`  Roaming fallback: ${roamingSource} - exists: ${fs.existsSync(roamingSource)}`);
    
    if (fs.existsSync(profileSource)) {
      console.log(chalk.blue("📱 Restoring single profile location"));
      logger.verbose(`Downloading: ${profileSource} -> ${roamingPath}`);
      
      const profileFiles = await backupPath(
        profileSource,
        roamingPath,
        [], // no excludes for download
        false, // not dry run
        true, // cleanup local files not in NAS
      );
      totalFiles += profileFiles;
      logger.verbose(`Profile download completed. Files: ${profileFiles}`);
    } else if (fs.existsSync(roamingSource)) {
      // Fallback: try roaming folder if profile doesn't exist (older backup format)
      console.log(
        chalk.yellow("⚠️ Using roaming folder as fallback for single profile"),
      );
      logger.warn(`Profile source not found, using roaming fallback: ${roamingSource}`);
      logger.verbose(`Downloading: ${roamingSource} -> ${roamingPath}`);
      
      const roamingFiles = await backupPath(
        roamingSource,
        roamingPath,
        [], // no excludes for download
        false, // not dry run
        true, // cleanup local files not in NAS
      );
      totalFiles += roamingFiles;
      logger.verbose(`Roaming fallback download completed. Files: ${roamingFiles}`);
    } else {
      console.log(chalk.red("Selected backup data not found"));
      logger.error(`No valid backup sources found. Profile: ${profileSource}, Roaming: ${roamingSource}`);
      return;
    }
  } else {
    // Separate profile locations (Windows style)
    console.log(chalk.blue("💻 Restoring separate profile locations"));
    logger.verbose(`Dual-path download - checking sources:`);
    logger.verbose(`  Roaming source: ${roamingSource} - exists: ${fs.existsSync(roamingSource)}`);
    logger.verbose(`  Local source: ${localSource} - exists: ${fs.existsSync(localSource)}`);

    if (!fs.existsSync(roamingSource)) {
      console.log(chalk.red("Selected backup data not found"));
      logger.error(`Roaming backup source not found: ${roamingSource}`);
      return;
    }

    // Download roaming data
    logger.verbose(`Downloading roaming data: ${roamingSource} -> ${roamingPath}`);
    const roamingFiles = await backupPath(
      roamingSource,
      roamingPath,
      [], // no excludes for download
      false, // not dry run
      true, // cleanup local files not in NAS
    );
    totalFiles += roamingFiles;
    logger.verbose(`Roaming download completed. Files: ${roamingFiles}`);

    // Download local data if it exists
    if (fs.existsSync(localSource)) {
      logger.verbose(`Downloading local data: ${localSource} -> ${localPath}`);
      const localFiles = await backupPath(
        localSource,
        localPath,
        [], // no excludes for download
        false, // not dry run
        true, // cleanup local files not in NAS
      );
      totalFiles += localFiles;
      logger.verbose(`Local download completed. Files: ${localFiles}`);
    } else {
      logger.verbose(`Local source does not exist, skipping: ${localSource}`);
    }
  }

  // Save metadata
  const metadata = await createSyncMetadata(
    config,
    "download",
    totalFiles,
    selectedBackupId, // Store relative backup ID instead of full path
  );
  logger.verbose(`Created download metadata with backupId: ${selectedBackupId}`);
  logger.debug(`Download metadata:`, metadata);
  
  await saveMetadata(base, metadata);
  logger.verbose(`Download metadata saved to: ${path.join(base, ".zen-sync-metadata.json")}`);

  console.log(chalk.green("✅ Download completed successfully!"));
  logger.info(`Download summary: ${totalFiles} files downloaded from backup ${selectedBackupId}`);
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
