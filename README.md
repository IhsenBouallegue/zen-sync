# Zen Browser NAS Sync

A cross-platform tool for syncing Zen Browser profiles with NAS storage, featuring smart merge capabilities and versioned backups.

## Features

- 🔄 **Cross-Platform**: Windows, macOS, and Linux support
- 📂 **Smart Path Detection**: Automatically detects Zen Browser installation paths
- 💾 **NAS Integration**: Backup and sync profiles to/from network storage
- 🔀 **Smart Merge**: Intelligent bidirectional sync without data loss
- 📊 **Versioned Backups**: Each backup gets a unique timestamp and machine ID
- 🎯 **Selective Sync**: Choose which data categories to sync (bookmarks, passwords, etc.)
- 📱 **Platform Awareness**: Handles Windows dual-path vs macOS/Linux single-path structures

## Quick Start

```bash
# Install dependencies
bun install

# Run the interactive tool
bun start
```

## Architecture

The project is organized into modular components:

### Core Modules

- **`src/types.ts`** - TypeScript interfaces and type definitions
- **`src/constants.ts`** - Configuration constants and default settings
- **`src/config.ts`** - Configuration management and validation
- **`src/utils.ts`** - Utility functions for paths, IDs, and platform detection
- **`src/backup.ts`** - File backup and restore operations
- **`src/metadata.ts`** - Sync metadata tracking and management
- **`src/sync.ts`** - Main sync operations (upload, download, smart merge)
- **`src/ui.ts`** - User interface and interactive prompts
- **`index.ts`** - Main entry point and application orchestration

### Data Flow

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Local     │◄──►│  Zen Sync    │◄──►│    NAS      │
│  Browser    │    │     Tool     │    │   Storage   │
│  Profiles   │    │              │    │             │
└─────────────┘    └──────────────┘    └─────────────┘
```

## Platform-Specific Behavior

### Windows
- **Roaming Data**: `%APPDATA%\zen\` (high priority - user settings, bookmarks, passwords)
- **Local Data**: `%LOCALAPPDATA%\zen\` (lower priority - cache and machine-specific files)

### macOS
- **Single Location**: `~/Library/Application Support/zen/`

### Linux
- **Single Location**: `~/.config/zen-browser/`

## Sync Categories

Choose what to sync from these categories:

- 📁 **Profile Configuration** - profiles.ini, installs.ini, compatibility.ini
- 🗃️ **Profile Groups** - Profile Groups databases  
- 📚 **Bookmarks** - places.sqlite, bookmarks.html
- 🔒 **Passwords & Certificates** - key4.db, cert9.db, logins.json
- 🧩 **Extensions** - extensions.json, extension-*.json
- 🎨 **Themes & CSS** - zen-*.json, zen-*.css, userChrome.css, userContent.css
- ⚙️ **Browser Preferences** - prefs.js, user.js
- 🔍 **Search Settings** - search.json.mozlz4
- 🖼️ **Favicons** - favicons.sqlite
- 📂 **Chrome Customizations** - chrome/**/*

## Development

```bash
# Development with auto-reload
bun run dev

# Type checking
bun run type-check

# Build JavaScript bundle
bun run build

# Build standalone executables
bun run build:exe              # Current platform
bun run build:exe:all          # All platforms at once
bun run build:exe:win          # Windows x64
bun run build:exe:linux        # Linux x64  
bun run build:exe:macos        # macOS x64
bun run build:exe:macos-arm    # macOS ARM64
```

## CI/CD & Releases

The project uses GitHub Actions with Bun's cross-compilation for automated building and releases:

- **🔄 Continuous Integration**: Runs on every push and pull request
- **🏗️ Cross-Platform Builds**: Uses Bun's `--target` flag to build for all platforms from Ubuntu
- **📦 Automated Releases**: Creates release archives when a new tag is published
- **✅ Quality Checks**: Type checking, file structure validation, and executable testing
- **⚡ Fast Builds**: Single runner cross-compiles to all platforms using [Bun's built-in capabilities](https://bun.sh/docs/bundler/executables)

### Build Artifacts

Each push generates a single artifact containing executables for:
- `zen-sync-win32-x64.exe` - Windows x64 executable
- `zen-sync-darwin-x64` - macOS Intel executable  
- `zen-sync-darwin-arm64` - macOS Apple Silicon executable
- `zen-sync-linux-x64` - Linux x64 executable

### Creating a Release

1. Create and push a new tag: `git tag v1.0.0 && git push origin v1.0.0`
2. Create a GitHub release from the tag
3. GitHub Actions will automatically build and attach platform-specific archives

## Configuration

The tool creates a `zen_nas_config.json` file to store:
- NAS destination path
- Zen Browser profile paths
- Selected sync categories
- Sync history and machine ID

## Metadata Tracking

Each sync operation saves metadata including:
- Unique backup ID (timestamp + machine name)
- Machine ID and hostname
- Platform information
- Sync type (upload/download/smart merge)
- File count and categories synced
- Timestamp and relative backup folder name

This enables features like:
- Viewing sync history
- Selecting specific backups to restore
- Cross-platform compatibility tracking

## License

MIT
