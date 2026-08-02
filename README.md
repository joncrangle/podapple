# 🍎 Podapple

A modern, terminal-based Apple Podcasts synchronizer built for speed and simplicity.

![Demo](./assets/demo.gif)

> [!IMPORTANT]
> macOS Only: This application relies on local macOS Podcasts databases and is not compatible with other operating systems.

## 🚀 Features

- 🖥️ **Modern TUI**: A fully interactive terminal experience powered by `@opentui`.
- ⚡ **Fast**: Built on the Bun runtime.
- 🔄 **Sync**: Transfer selected episodes from Podcasts app to external drives or Digital Audio Players (DAPs).

### 📂 Sync Engine Capabilities

The core of `Podapple` is a sync engine optimized for external storage and digital audio players.

**Technical Highlights**

| Feature           | Description                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| Auto-Detection    | Instantly identifies compatible external volumes and mount points.              |
| Smart Metadata    | Injects ID3 tags (Title, Artist, Album) so episodes look perfect on any device. |
| Filesystem Safety | Automatically sanitizes filenames to prevent errors on FAT32/exFAT drives.      |
| Real-time Metrics | Monitors transfer speeds, byte counts, and queue progress with precision.       |

## Getting Started

### Prerequisites

- **macOS**
- [Bun](https://bun.sh)

### Installation

#### Homebrew

```bash
brew tap joncrangle/tap
brew install podapple
```

#### Mise

```bash
mise use -g github:joncrangle/podapple@latest
```

Installs the latest release binary for your Mac's architecture and registers it as a globally managed [mise](https://mise.jdx.dev) tool.

#### Binary

Download a prebuilt binary for Apple Silicon (arm64) or Intel Mac (x86_64) from the [latest release](https://github.com/joncrangle/podapple/releases).

## Development

To get started with local development:

```bash
git clone https://github.com/joncrangle/podapple.git
cd podapple
bun install
just start
```

This project uses [`just`](https://github.com/casey/just) as a command runner:

```bash
just --list       # Show all commands
just test         # Run tests
just lint         # Lint code
just check        # Type check
just build        # Build for production
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **UI Framework**: [SolidJS](https://github.com/solidjs/solid) + [OpenTUI](https://github.com/anomalyco/opentui)
- **Logic & Effects**: [Effect TS](https://github.com/effect-ts/effect)
