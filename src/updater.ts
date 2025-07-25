import { readFile, writeFile, chmod, rename } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import chalk from "chalk";
import enquirer from "enquirer";

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  assets: {
    name: string;
    browser_download_url: string;
    size: number;
  }[];
}

function getCurrentVersion(): string {
  try {
    const packageJson = require("../package.json");
    return packageJson.version;
  } catch {
    return "unknown";
  }
}

function getRepositoryInfo(): { owner: string; repo: string } | null {
  try {
    const packageJson = require("../package.json");
    const repoUrl = packageJson.repository?.url || packageJson.homepage;
    
    if (!repoUrl) return null;
    
    // Extract owner/repo from GitHub URL
    const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!match) return null;
    
    return { owner: match[1], repo: match[2] };
  } catch {
    return null;
  }
}

function getPlatformExecutableName(): string {
  const platform = os.platform();
  const arch = os.arch();
  
  switch (platform) {
    case "win32":
      return "zen-sync-win32-x64.exe";
    case "darwin":
      return arch === "arm64" ? "zen-sync-darwin-arm64" : "zen-sync-darwin-x64";
    case "linux":
      return "zen-sync-linux-x64";
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const repoInfo = getRepositoryInfo();
    if (!repoInfo) {
      throw new Error("Repository information not found in package.json");
    }
    
    const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/releases/latest`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    return await response.json() as GitHubRelease;
  } catch (error) {
    console.error(chalk.red("Failed to fetch latest release:"), error);
    return null;
  }
}

function compareVersions(current: string, latest: string): boolean {
  // Remove 'v' prefix if present
  const cleanCurrent = current.replace(/^v/, "");
  const cleanLatest = latest.replace(/^v/, "");
  
  const currentParts = cleanCurrent.split(".").map(Number);
  const latestParts = cleanLatest.split(".").map(Number);
  
  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const curr = currentParts[i] || 0;
    const lat = latestParts[i] || 0;
    
    if (lat > curr) return true;
    if (lat < curr) return false;
  }
  
  return false; // Versions are equal
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  console.log(chalk.cyan(`Downloading: ${url}`));
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  
  const totalSize = parseInt(response.headers.get("content-length") || "0");
  let downloadedSize = 0;
  
  if (!response.body) {
    throw new Error("No response body");
  }
  
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    chunks.push(value);
    downloadedSize += value.length;
    
    if (totalSize > 0) {
      const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
      process.stdout.write(`\r${chalk.blue(`Progress: ${progress}%`)}`);
    }
  }
  
  console.log(); // New line after progress
  
  // Combine chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  await writeFile(outputPath, result);
  console.log(chalk.green(`✓ Downloaded to: ${outputPath}`));
}

export async function checkForUpdates(silent = false): Promise<boolean> {
  if (!silent) {
    console.log(chalk.cyan("🔍 Checking for updates..."));
  }
  
  const currentVersion = getCurrentVersion();
  const latestRelease = await fetchLatestRelease();
  
  if (!latestRelease) {
    if (!silent) {
      console.log(chalk.yellow("⚠️ Could not check for updates"));
    }
    return false;
  }
  
  const hasUpdate = compareVersions(currentVersion, latestRelease.tag_name);
  
  if (!hasUpdate) {
    if (!silent) {
      console.log(chalk.green(`✅ You're running the latest version (${currentVersion})`));
    }
    return false;
  }
  
  if (!silent) {
    console.log(chalk.yellow(`📦 New version available!`));
    console.log(chalk.gray(`   Current: ${currentVersion}`));
    console.log(chalk.gray(`   Latest:  ${latestRelease.tag_name}`));
    console.log(chalk.gray(`   Released: ${new Date(latestRelease.published_at).toLocaleDateString()}`));
  }
  
  return true;
}

export async function performUpdate(): Promise<boolean> {
  console.log(chalk.bold.cyan("\n🚀 Starting update process..."));
  
  const currentVersion = getCurrentVersion();
  const latestRelease = await fetchLatestRelease();
  
  if (!latestRelease) {
    console.log(chalk.red("❌ Could not fetch release information"));
    return false;
  }
  
  const hasUpdate = compareVersions(currentVersion, latestRelease.tag_name);
  if (!hasUpdate) {
    console.log(chalk.green("✅ Already running the latest version"));
    return false;
  }
  
  console.log(chalk.yellow(`Updating from ${currentVersion} to ${latestRelease.tag_name}`));
  
  // Find the correct asset for current platform
  const executableName = getPlatformExecutableName();
  const asset = latestRelease.assets.find(a => a.name === executableName);
  
  if (!asset) {
    console.log(chalk.red(`❌ No executable found for platform: ${executableName}`));
    return false;
  }
  
  console.log(chalk.cyan(`Found executable: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`));
  
  // Confirm update
  const { confirm } = await enquirer.prompt({
    type: "confirm",
    name: "confirm",
    message: `Download and install ${latestRelease.tag_name}?`,
  }) as { confirm: boolean };
  
  if (!confirm) {
    console.log(chalk.gray("Update cancelled"));
    return false;
  }
  
  try {
    // Create temporary file path
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `zen-sync-update-${Date.now()}${path.extname(executableName)}`);
    
    // Download new version
    await downloadFile(asset.browser_download_url, tempFile);
    
    // Make executable on Unix systems
    if (os.platform() !== "win32") {
      await chmod(tempFile, 0o755);
    }
    
    // Get current executable path
    const currentExePath = process.execPath;
    const backupPath = currentExePath + ".backup";
    
    console.log(chalk.cyan("🔄 Replacing executable..."));
    
    // Create backup of current executable
    await rename(currentExePath, backupPath);
    
    try {
      // Move new executable to current location
      await rename(tempFile, currentExePath);
      
      console.log(chalk.green("✅ Update completed successfully!"));
      console.log(chalk.yellow("🔄 Please restart the application to use the new version"));
      
      // Clean up backup
      const fs = require("node:fs");
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      
      return true;
    } catch (error) {
      // Restore backup if replacement failed
      console.error(chalk.red("❌ Failed to replace executable, restoring backup..."));
      await rename(backupPath, currentExePath);
      throw error;
    }
  } catch (error) {
    console.error(chalk.red("❌ Update failed:"), error);
    return false;
  }
}

export async function autoUpdateCheck(): Promise<void> {
  // Check for updates silently and prompt if available
  const hasUpdate = await checkForUpdates(true);
  
  if (hasUpdate) {
    console.log(chalk.yellow("📦 A new version is available!"));
    
    const { update } = await enquirer.prompt({
      type: "confirm", 
      name: "update",
      message: "Would you like to update now?",
    }) as { update: boolean };
    
    if (update) {
      await performUpdate();
    } else {
      console.log(chalk.gray("💡 Run 'Check for Updates' from the menu to update later"));
    }
  }
} 