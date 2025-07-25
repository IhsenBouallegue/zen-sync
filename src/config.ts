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
        this.data = JSON.parse(raw);
      } else {
        throw new Error("File is empty");
      }
    } catch {
      this.data = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
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

  async validateZenPath(roamingPath: string): Promise<boolean> {
    try {
      // Check if the roaming directory exists
      const fs = require("node:fs");
      if (!fs.existsSync(roamingPath)) {
        console.log(chalk.yellow(`Directory does not exist: ${roamingPath}`));
        return false;
      }

      // Check for profiles.ini (most important file)
      const profilesIni = path.join(roamingPath, "profiles.ini");
      if (!fs.existsSync(profilesIni)) {
        console.log(chalk.yellow(`profiles.ini not found in: ${roamingPath}`));
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
