import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import fg from "fast-glob";
import { SYNC_CATEGORIES } from "./constants.js";

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

  console.log(
    chalk.blue(
      `Syncing categories: ${selectedCategories?.join(", ") || "All"}`,
    ),
  );

  const files = await fg(includePatterns, {
    cwd: src,
    dot: true,
    onlyFiles: true,
    ignore: exclude,
  });
  console.log(chalk.cyan(`Found ${files.length} files to copy:`));
  let copiedCount = 0;
  for (const file of files) {
    const s = path.join(src, file);
    const d = path.join(dest, file);
    console.log(chalk.gray(`${dryRun ? "[DRY RUN] " : ""}Copying: ${file}`));
    if (!dryRun) {
      await mkdir(path.dirname(d), { recursive: true });
      await cp(s, d, { force: true });
    }
    copiedCount++;
  }
  console.log(
    chalk.green(`✓ ${dryRun ? "Would copy" : "Copied"} ${copiedCount} files.`),
  );

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
