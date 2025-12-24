# Publish Release Script

This script automates the process of publishing distribution files to GitHub Releases using the GitHub CLI (`gh`).

## Prerequisites

- GitHub CLI (`gh`) installed and authenticated
- Distribution files in the `dist/` directory
- Git repository with appropriate permissions

## Usage

```bash
# Basic usage (will detect version from package.json)
./scripts/publish-release.sh

# With custom tag and release title
./scripts/publish-release.sh v1.0.0 "My App v1.0.0" CHANGELOG.md

# With only a custom tag
./scripts/publish-release.sh v1.0.0
```

## Files Published

The script will automatically find and upload these file types from the `dist/` directory:
- `.dmg` - macOS disk image
- `.AppImage` - Linux portable application
- `.exe` - Windows executable
- `.zip` - Cross-platform archive
- `.blockmap` - Delta update files
- `.yml` / `.yaml` - Configuration and update metadata

## Authentication

Before running the script, ensure you're authenticated with GitHub CLI:

```bash
gh auth login
```

## Configuration

The script will:
- Detect version from `package.json` if no tag is provided
- Use `CHANGELOG.md` as release notes if available
- Create a temporary release notes file if none exists