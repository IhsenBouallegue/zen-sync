#!/usr/bin/env bun

import os from "node:os";
import chalk from "chalk";
import enquirer from "enquirer";
import { ZenNasConfig } from "./src/config.js";
import { downloadFromNas, smartSync, uploadToNas } from "./src/sync.js";
import {
  chooseSyncCategories,
  displayHeader,
  explainWindowsPaths,
  listAvailableBackups,
  listProfiles,
  manualPathConfig,
  pause,
  viewSyncHistory,
} from "./src/ui.js";
import { pathsAreSame } from "./src/utils.js";
import { autoUpdateCheck, checkForUpdates, performUpdate } from "./src/updater.js";
import { enableVerboseLogging, logger } from "./src/logger.js";

async function interactive() {
  const config = new ZenNasConfig();

  // Check for updates on startup (once per session)
  await autoUpdateCheck();

  while (true) {
    console.clear();
    displayHeader(config);

    const { cmd: action } = (await enquirer.prompt({
      type: "select",
      name: "cmd",
      message: "Choose an action",
      choices: [
        "Configure NAS & Paths",
        "Choose Sync Categories",
        "List Profiles",
        "Upload to NAS",
        "Download from NAS",
        "Sync (Smart Merge)",
        "List Available Backups",
        "View Sync History",
        "Explain Path Structure",
        "Check for Updates",
        "Enable Verbose Logging",
        "Exit",
      ],
    })) as { cmd: string };

    if (action === "Exit") {
      console.log(chalk.blue("Goodbye!"));
      process.exit(0);
    }

    if (action === "Configure NAS & Paths") {
      const { auto } = (await enquirer.prompt({
        type: "confirm",
        name: "auto",
        message: "Auto-detect Zen paths?",
      })) as { auto: boolean };

      if (auto) {
        const paths = config.autoDetectPaths();
        console.log(chalk.cyan("Auto-detected paths:"));
        console.log(`  Roaming: ${paths.roaming}`);
        console.log(`  Local: ${paths.local}`);

        console.log(chalk.cyan("\nValidating paths..."));
        const isValid = await config.validateZenPath(paths.roaming);

        if (isValid) {
          const { useDetected } = (await enquirer.prompt({
            type: "confirm",
            name: "useDetected",
            message: "Use auto-detected paths?",
          })) as { useDetected: boolean };

          if (useDetected) {
            config.data.sync.zen_roaming_path = paths.roaming;
            config.data.sync.zen_local_path = paths.local;
          } else {
            await manualPathConfig(config);
          }
        } else {
          console.log(
            chalk.red("Auto-detection failed. Please enter paths manually."),
          );
          await manualPathConfig(config);
        }
      } else {
        await manualPathConfig(config);
      }

      const { nas: nasPath } = (await enquirer.prompt({
        type: "input",
        name: "nas",
        message: "NAS destination path",
        initial: config.data.nas.destination_path,
      })) as { nas: string };
      config.data.nas.destination_path = nasPath;
      await config.save();
      console.log(chalk.green("Configuration saved."));
      await pause();
    }

    if (action === "Choose Sync Categories") {
      await chooseSyncCategories(config);
      await pause();
    }

    if (action === "List Profiles") {
      await listProfiles(config);
      await pause();
    }

    if (action === "Upload to NAS") {
      if (!config.data.nas.destination_path) {
        console.log(chalk.red("NAS path not set. Configure first."));
        await pause();
        continue;
      }

      const { confirm } = (await enquirer.prompt({
        type: "confirm",
        name: "confirm",
        message: "Upload local Zen Browser data to NAS?",
      })) as { confirm: boolean };

      if (confirm) {
        await uploadToNas(config);
        config.data.state.lastUpload = new Date().toISOString();
        await config.save();
      }
      await pause();
    }

    if (action === "Download from NAS") {
      if (!config.data.nas.destination_path) {
        console.log(chalk.red("NAS path not set. Configure first."));
        await pause();
        continue;
      }

      const { confirm } = (await enquirer.prompt({
        type: "confirm",
        name: "confirm",
        message:
          "Download Zen Browser data from NAS? This will replace local files.",
      })) as { confirm: boolean };

      if (confirm) {
        await downloadFromNas(config);
        config.data.state.lastDownload = new Date().toISOString();
        await config.save();
      }
      await pause();
    }

    if (action === "Sync (Smart Merge)") {
      if (!config.data.nas.destination_path) {
        console.log(chalk.red("NAS path not set. Configure first."));
        await pause();
        continue;
      }

      const { confirm } = (await enquirer.prompt({
        type: "confirm",
        name: "confirm",
        message:
          "Perform smart sync with NAS? This will merge local and remote data.",
      })) as { confirm: boolean };

      if (confirm) {
        await smartSync(config);
        config.data.state.lastSync = new Date().toISOString();
        await config.save();
      }
      await pause();
    }

    if (action === "List Available Backups") {
      await listAvailableBackups(config);
      await pause();
    }

    if (action === "View Sync History") {
      await viewSyncHistory(config);
      await pause();
    }

    if (action === "Explain Path Structure") {
      explainWindowsPaths();

      // Show current configuration
      console.log(chalk.bold.cyan("📍 Your Current Configuration:"));
      const roamingPath = config.data.sync.zen_roaming_path;
      const localPath = config.data.sync.zen_local_path;

      if (pathsAreSame(roamingPath, localPath)) {
        console.log(
          chalk.green(`   📱 Single Profile Location (${os.platform()})`),
        );
        console.log(chalk.gray(`      ${roamingPath || "Not configured"}`));
        console.log(chalk.gray(`      ↳ Contains all user data and settings`));
      } else {
        console.log(chalk.green(`   📂 Roaming Data (Priority: HIGH)`));
        console.log(chalk.gray(`      ${roamingPath || "Not configured"}`));
        console.log(chalk.yellow(`   💾 Local Data (Priority: LOWER)`));
        console.log(chalk.gray(`      ${localPath || "Not configured"}`));
      }

      await pause();
    }

    if (action === "Check for Updates") {
      const hasUpdate = await checkForUpdates();
      
      if (hasUpdate) {
        const { update } = (await enquirer.prompt({
          type: "confirm",
          name: "update",
          message: "Would you like to update now?",
        })) as { update: boolean };

        if (update) {
          await performUpdate();
          // Exit after update since executable has been replaced
          process.exit(0);
        }
      }
      
      await pause();
    }

    if (action === "Enable Verbose Logging") {
      enableVerboseLogging();
      console.log(chalk.green("✅ Verbose logging enabled for this session"));
      console.log(chalk.gray("Use this to debug sync issues and see detailed operation logs"));
      await pause();
    }
  }
}

interactive().catch((e) => {
  console.error(chalk.red("Fatal error:"), e);
  process.exit(1);
});
