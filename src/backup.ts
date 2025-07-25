import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import fg from "fast-glob";
import ora from "ora";
import { SYNC_CATEGORIES } from "./constants.js";
import { logger } from './logger.js';

export async function backupPath(
  src: string,
  dest: string,
  exclude: string[],
  dryRun: boolean,
  cleanup: boolean,
  selectedCategories?: string[],
): Promise<number> {
  console.log(chalk.bold(`\nBacking up:`), src, chalk.bold(`→`), dest);
  
  if (!dryRun) await mkdir(dest, { recursive: true });

  // Build include patterns from selected categories
  const includePatterns = selectedCategories
    ? selectedCategories.flatMap(
        (category) => (SYNC_CATEGORIES as any)[category] || [],
      )
    : ["**/*"]; // If no categories selected, include everything

  console.log(chalk.blue("Syncing categories:"));
  selectedCategories?.forEach((category) => {
    console.log(chalk.gray(`  ${category}`));
  });
  
  logger.debug(`Include patterns: ${includePatterns.length} patterns, Exclusions: ${exclude.length} patterns`);

  // Debug: Check if source directory exists and what's in it
  const fs = require("node:fs");
  if (!fs.existsSync(src)) {
    console.log(chalk.red(`Source directory does not exist: ${src}`));
    return 0;
  }
  
  // List some files in the source directory for debugging
  try {
    const sourceFiles = fs.readdirSync(src, { withFileTypes: true });
    console.log(chalk.gray(`Source directory contains ${sourceFiles.length} items:`));
    sourceFiles.slice(0, 10).forEach((item: any) => {
      console.log(chalk.gray(`  ${item.isDirectory() ? '📁' : '📄'} ${item.name}`));
    });
    if (sourceFiles.length > 10) {
      console.log(chalk.gray(`  ... and ${sourceFiles.length - 10} more items`));
    }
  } catch (error) {
    console.log(chalk.red(`Error reading source directory: ${error}`));
  }

  const files = await fg(includePatterns, {
    cwd: src,
    dot: true,
    onlyFiles: true,
    ignore: exclude,
  });
  console.log(chalk.cyan(`Found ${files.length} files to copy:`));
  
  // Debug: Show the first few files that will be copied
  if (files.length > 0) {
    console.log(chalk.gray("Files to copy:"));
    files.slice(0, 5).forEach((file: string) => {
      console.log(chalk.gray(`  📄 ${file}`));
    });
    if (files.length > 5) {
      console.log(chalk.gray(`  ... and ${files.length - 5} more files`));
    }
  } else {
    console.log(chalk.yellow("⚠️ No files found matching the patterns!"));
    console.log(chalk.gray("Include patterns:"), includePatterns);
    console.log(chalk.gray("Exclude patterns:"), exclude);
  }
  
  let copiedCount = 0;
  
  if (files.length > 0) {
    const spinner = ora({
      text: `Copying files...`,
      color: 'blue'
    }).start();
    
    for (const file of files) {
      const s = path.join(src, file);
      const d = path.join(dest, file);
      
      spinner.text = `${dryRun ? "[DRY RUN] " : ""}Copying: ${file}`;
      
      if (!dryRun) {
        await mkdir(path.dirname(d), { recursive: true });
        await cp(s, d, { force: true });
      }
      copiedCount++;
    }
    
    spinner.succeed(`✓ ${dryRun ? "Would copy" : "Copied"} ${copiedCount} files.`);
  } else {
    console.log(chalk.yellow("⚠️ No files to copy."));
  }

  if (cleanup) {
    const destFiles = await fg(["**/*"], {
      cwd: dest,
      dot: true,
      onlyFiles: true,
    });
    const toDel = destFiles.filter((f) => !files.includes(f));
    if (toDel.length > 0) {
      console.log(chalk.yellow(`Found ${toDel.length} stale files to remove:`));
      for (const f of toDel) {
        console.log(chalk.gray(`${dryRun ? "[DRY RUN] " : ""}Removing: ${f}`));
        if (!dryRun) await rm(path.join(dest, f), { force: true });
      }
      console.log(
        chalk.green(
          `✓ ${dryRun ? "Would remove" : "Removed"} ${toDel.length} files.`,
        ),
      );
    } else {
      console.log(chalk.blue("No stale files to remove."));
    }
  }

  return copiedCount;
}
