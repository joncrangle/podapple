/**
 * Heuristically detect if the user has a Nerd Font installed.
 * This checks for common environment variables set by terminals
 * that typically have Nerd Fonts configured, or explicit overrides.
 */
export function hasNerdFont(): boolean {
  if (Bun.env.HAS_NERDFONT === "true" || Bun.env.NERD_FONTS === "true") {
    return true;
  }
  if (Bun.env.HAS_NERDFONT === "false" || Bun.env.NERD_FONTS === "false") {
    return false;
  }

  const termProgram = Bun.env.TERM_PROGRAM;
  const terminalEmulator = Bun.env.TERMINAL_EMULATOR;
  const term = Bun.env.TERM;

  if (
    termProgram === "iTerm.app" ||
    termProgram === "vscode" ||
    termProgram === "Hyper" ||
    termProgram === "WezTerm"
  ) {
    return true;
  }

  if (term === "xterm-kitty" || term === "alacritty") {
    return true;
  }

  if (terminalEmulator === "JetBrains-JediTerm") {
    return true;
  }

  return false;
}
