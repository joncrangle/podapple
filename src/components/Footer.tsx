import { createMemo, createSignal, For } from "solid-js";
import { Colors } from "@/theme/colors";

export interface Shortcut {
  key: string;
  label: string;
}

export interface FooterProps {
  shortcuts: Shortcut[][];
  onShortcutClick?: (key: string) => void;
}

export function Footer(props: FooterProps) {
  const [hoveredKeyId, setHoveredKeyId] = createSignal<string | null>(null);
  const activeShortcuts = () => props.shortcuts.filter((s) => s.length > 0);

  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <For each={activeShortcuts()}>
        {(lineShortcuts, lineIndex) => (
          <box flexDirection="row" justifyContent="center" flexWrap="wrap" gap={2}>
            <For each={lineShortcuts}>
              {(shortcut, index) => {
                const keyParts = createMemo(() => shortcut.key.split("/"));
                const isSplit = createMemo(() => keyParts().length > 1);
                const getPartId = (part: string) => `${lineIndex()}-${index()}-${part}`;

                return (
                  <box flexDirection="row" gap={1}>
                    <box flexDirection="row">
                      <For each={keyParts()}>
                        {(part, i) => (
                          <box flexDirection="row">
                            {/* biome-ignore lint/a11y/noStaticElementInteractions: TUI component */}
                            {/* biome-ignore lint/a11y/useKeyWithMouseEvents: TUI component */}
                            <box
                              onMouseDown={() => props.onShortcutClick?.(part)}
                              onMouseOver={() => setHoveredKeyId(getPartId(part))}
                              onMouseOut={() => setHoveredKeyId(null)}
                            >
                              <text
                                style={{
                                  fg:
                                    hoveredKeyId() === getPartId(part)
                                      ? Colors.list.focused
                                      : Colors.footer.key,
                                }}
                              >
                                {part}
                              </text>
                            </box>
                            {i() < keyParts().length - 1 && (
                              <text style={{ fg: Colors.footer.key }}>/</text>
                            )}
                          </box>
                        )}
                      </For>
                    </box>
                    {/* biome-ignore lint/a11y/noStaticElementInteractions: TUI component */}
                    {/* biome-ignore lint/a11y/useKeyWithMouseEvents: TUI component */}
                    <box
                      onMouseDown={() => !isSplit() && props.onShortcutClick?.(shortcut.key)}
                      onMouseOver={() => !isSplit() && setHoveredKeyId(getPartId(shortcut.key))}
                      onMouseOut={() => !isSplit() && setHoveredKeyId(null)}
                    >
                      <text
                        style={{
                          fg: keyParts().some((p) => hoveredKeyId() === getPartId(p))
                            ? Colors.list.focused
                            : Colors.footer.text,
                        }}
                      >
                        {shortcut.label}
                      </text>
                    </box>
                    {index() < lineShortcuts.length - 1 && (
                      <text style={{ fg: Colors.footer.separator }}>•</text>
                    )}
                  </box>
                );
              }}
            </For>
          </box>
        )}
      </For>
    </box>
  );
}
