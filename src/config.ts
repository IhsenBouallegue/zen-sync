import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import ini from "ini";
import { CONFIG_FILE, DEFAULT_CONFIG } from "./constants.js";
import type { ConfigData } from "./types.js";
import { autoDetectPaths, generateMachineId } from "./utils.js";

export class ZenNasConfig {
  filePath: string;
  data: ConfigData;

  constructor(filePath = CONFIG_FILE) {
    this.filePath = filePath;
    try {
      const file = Bun.file(filePath);
      if (file.size > 0) {
        const raw = require("node:fs").readFileSync(filePath, "utf-8");
        const savedConfig = JSON.parse(raw);
        // Merge with defaults to ensure all fields exist
        this.data = { ...DEFAULT_CONFIG, ...savedConfig };
        console.log(chalk.gray(`Config loaded: sync_path = "${this.data.sync.sync_path}"`));
      } else {
        throw new Error("File is empty");
      }
    } catch {
      this.data = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      console.log(chalk.gray("No config file found, using defaults"));
      this.saveSync();
    }
  }

  saveSync() {
    writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  async save() {
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  autoDetectPaths() {
    return autoDetectPaths();
  }

  async validateZenPath(syncPath: string): Promise<boolean> {
    try {
      // Check if the directory exists
      const fs = require("node:fs");
      if (!fs.existsSync(syncPath)) {
        console.log(chalk.yellow(`Directory does not exist: ${syncPath}`));
        return false;
      }

      // Check for profiles.ini (most important file)
      const profilesIni = path.join(syncPath, "profiles.ini");
      if (!fs.existsSync(profilesIni)) {
        console.log(chalk.yellow(`profiles.ini not found in: ${syncPath}`));
        return false;
      }

      // Check if profiles.ini contains Zen Browser profiles
      const content = await readFile(profilesIni, "utf-8");
      const parsed = ini.parse(content);
      const hasProfiles = Object.keys(parsed).some((key) =>
        key.startsWith("Profile"),
      );

      if (!hasProfiles) {
        console.log(chalk.yellow(`No profiles found in profiles.ini`));
        return false;
      }

      console.log(chalk.green(`✓ Valid Zen Browser installation found`));
      return true;
    } catch (error) {
      console.log(chalk.red(`Error validating path: ${error}`));
      return false;
    }
  }

  async ensureMachineId() {
    if (!this.data.state.machineId) {
      this.data.state.machineId = generateMachineId();
      await this.save();
    }
  }
}
