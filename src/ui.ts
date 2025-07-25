import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import chalk from "chalk";
import enquirer from "enquirer";
import ini from "ini";
import type { ZenNasConfig } from "./config.js";
import { SYNC_CATEGORIES } from "./constants.js";
import type { SyncMetadata } from "./types.js";


export async function pause() {
  await enquirer.prompt({
    type: "input",
    name: "pause",
    message: "Press enter to continue",
  });
}

export async function manualPathConfig(config: ZenNasConfig) {
  const currentPath = config.data.sync.sync_path || '';
  
  const { profilePath } = (await enquirer.prompt({
    type: "input",
    name: "profilePath",
    message: "Zen Browser profile path (where profiles.ini is located)",
    initial: currentPath,
  })) as { profilePath: string };

  // Validate the manually entered path
  console.log(chalk.cyan("Validating manually entered path..."));
  const isValid = await config.validateZenPath(profilePath);

  if (!isValid) {
    const { proceed } = (await enquirer.prompt({
      type: "confirm",
      name: "proceed",
      message: "Path validation failed. Continue anyway?",
    })) as { proceed: boolean };

    if (!proceed) {
      return;
    }
  }

  config.data.sync.sync_path = profilePath;
}

export async function listProfiles(config: ZenNasConfig) {
  const syncPath = config.data.sync.sync_path;
  
  if (!syncPath) {
    console.error(chalk.red("No Zen Browser path configured."));
    return;
  }
  
  const iniPath = path.join(syncPath, "profiles.ini");
  try {
    const content = await readFile(iniPath, "utf-8");
    const parsed = ini.parse(content);
    console.log(chalk.bold.cyan("\nAvailable Zen Browser Profiles:"));
    for (const [sec, props] of Object.entries(parsed)) {
      if (
        sec.startsWith("Profile") &&
        typeof props === "object" &&
        props !== null
      ) {
        const profileProps = props as Record<string, string>;
        const name = profileProps.Name;
        const rel = profileProps.Path;
        const def =
          profileProps.Default === "1" ? chalk.green(" (Default)") : "";
        console.log(`• ${chalk.yellow(name)}${def}`);
        console.log(`  Path: ${rel}\n`);
      }
    }
  } catch (e) {
    console.error(chalk.red("Failed to read profiles.ini:"), e);
  }
}



export async function listAvailableBackups(config: ZenNasConfig) {
  const base = config.data.nas.destination_path;
  const metadataPath = path.join(base, ".zen-sync-metadata.json");

  try {
    const fs = require("node:fs");
    if (!fs.existsSync(metadataPath)) {
      console.log(chalk.yellow("No backup history found."));
      return;
    }

    const content = await readFile(metadataPath, "utf-8");
    const metadata: SyncMetadata[] = JSON.parse(content);

    const uploads = metadata.filter((m) => m.syncType === "upload");

    if (uploads.length === 0) {
      console.log(chalk.yellow("No backups found."));
      return;
    }

    console.log(chalk.bold.cyan("\n📦 Available Backups:"));
    console.log(chalk.gray("─".repeat(80)));

    uploads.reverse().forEach((entry, index) => {
      const date = new Date(entry.timestamp).toLocaleString();
      const sizeInfo = `${entry.fileCount} files`;
      const categoriesInfo = `${entry.categories.length} categories`;

      // Check if backup folder actually exists (reconstruct full path)
      const fullBackupPath = path.join(base, entry.backupId);
      const exists = fs.existsSync(fullBackupPath);
      const status = exists ? chalk.green("✓") : chalk.red("✗ Missing");

      console.log(`${index + 1}. ${chalk.yellow(entry.backupId)} ${status}`);
      console.log(`   Date: ${chalk.cyan(date)}`);
      console.log(
        `   Machine: ${chalk.cyan(entry.machineName)} (${entry.platform})`,
      );
      console.log(
        `   Content: ${chalk.green(sizeInfo)} | ${chalk.blue(categoriesInfo)}`,
      );
      console.log(`   Folder: ${chalk.gray(entry.backupId)}`);
      console.log();
    });
  } catch (error) {
    console.error(chalk.red("Error reading backup list:"), error);
  }
}

export async function viewSyncHistory(config: ZenNasConfig) {
  const metadataPath = path.join(
    config.data.nas.destination_path,
    ".zen-sync-metadata.json",
  );

  try {
    const fs = require("node:fs");
    if (!fs.existsSync(metadataPath)) {
      console.log(chalk.yellow("No sync history found."));
      return;
    }

    const content = await readFile(metadataPath, "utf-8");
    const metadata: SyncMetadata[] = JSON.parse(content);

    console.log(chalk.bold.cyan("\n📊 Sync History:"));
    console.log(chalk.gray("─".repeat(80)));

    const recent = metadata.slice(-10).reverse(); // Show last 10, most recent first

    for (const entry of recent) {
      const date = new Date(entry.timestamp).toLocaleString();
      const typeIcon =
        entry.syncType === "upload"
          ? "⬆️"
          : entry.syncType === "download"
            ? "⬇️"
            : "🔄";

      console.log(
        `${typeIcon} ${chalk.bold(entry.syncType.toUpperCase())} - ${chalk.cyan(date)}`,
      );
      console.log(`   Backup ID: ${chalk.yellow(entry.backupId || "N/A")}`);
      console.log(
        `   Machine: ${chalk.cyan(entry.machineName)} (${entry.platform})`,
      );
      console.log(
        `   Files: ${chalk.green(entry.fileCount)} | Categories: ${entry.categories.length}`,
      );
      console.log(`   Path: ${chalk.gray(path.basename(entry.backupId))}`);
      console.log();
    }

    if (metadata.length > 10) {
      console.log(chalk.gray(`... and ${metadata.length - 10} older entries`));
    }
  } catch (error) {
    console.error(chalk.red("Error reading sync history:"), error);
  }
}

export function displayHeader(config: ZenNasConfig) {
  console.log(chalk.bold.green("Zen NAS Sync"));
  console.log(
    chalk.gray(
      `Machine: ${os.hostname()} (${config.data.state.machineId?.slice(0, 8) || "new"})`,
    ),
  );

  // Show platform-specific info
  const syncPath = config.data.sync.sync_path;
  if (syncPath) {
    console.log(
      chalk.gray(`Platform: ${os.platform()} (profile location)`),
    );
    console.log(chalk.gray(`Profile: ${syncPath}`));
  } else {
    console.log(chalk.gray(`Platform: ${os.platform()} (not configured)`));
  }

  console.log(
    chalk.gray(`Last upload: ${config.data.state.lastUpload || "never"}`),
  );
  console.log(
    chalk.gray(`Last download: ${config.data.state.lastDownload || "never"}`),
  );
  console.log(
    chalk.gray(`Last sync: ${config.data.state.lastSync || "never"}\n`),
  );
}

export async function chooseSyncCategories(config: ZenNasConfig) {
  const currentCategories =
    config.data.sync.categories || Object.keys(SYNC_CATEGORIES);
  const choices = Object.keys(SYNC_CATEGORIES).map((category) => ({
    name: category,
    value: category,
    enabled: currentCategories.includes(category),
  }));

  const { categories } = (await enquirer.prompt({
    type: "multiselect",
    name: "categories",
    message: "Select categories to sync:",
    choices: choices,
    initial: currentCategories,
  } as any)) as { categories: string[] };

  config.data.sync.categories = categories;
  await config.save();

  console.log(chalk.green(`\nUpdated sync categories:`));
  for (const category of categories) {
    console.log(chalk.cyan(`  ✓ ${category}`));
  }
}
