# Installing i18n-vue for Codex

Enable i18n-vue skills in Codex via native skill discovery.
Clone and symlink.

## Prerequisites

- Git
- Node.js (for running the bundled scripts)

## Installation

1. **Clone the repository:**

```bash
git clone https://github.com/Chyelong/i18n-vue-plugin.git ~/.codex/i18n-vue-plugin
```

2. **Create the skills symlink:**

```bash
mkdir -p ~/.agents/skills
ln -s ~/.codex/i18n-vue-plugin/skills ~/.agents/skills/i18n-vue
```

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
cmd /c mklink /J "$env:USERPROFILE\.agents\skills\i18n-vue" "$env:USERPROFILE\.codex\i18n-vue-plugin\skills"
```

3. **Restart Codex** (quit and relaunch the CLI) to discover skills.

## Verify

```bash
ls -la ~/.agents/skills/i18n-vue
```

You should see a symlink (or junction on Windows) pointing to the repository `skills` directory.

## Updating

```bash
cd ~/.codex/i18n-vue-plugin && git pull
```

Updates apply immediately through the symlink.

## Uninstalling

```bash
rm ~/.agents/skills/i18n-vue
```

Optionally delete the clone:

```bash
rm -rf ~/.codex/i18n-vue-plugin
```
