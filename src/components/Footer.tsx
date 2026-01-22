import { For } from "solid-js";
import { Colors } from "@/theme/colors";

export interface Shortcut {
  key: string;
  label: string;
}

export interface FooterProps {
  shortcuts: Shortcut[][];
}

export function Footer(props: FooterProps) {
  const activeShortcuts = () => props.shortcuts.filter((s) => s.length > 0);

  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <For each={activeShortcuts()}>
        {(lineShortcuts) => (
          <box flexDirection="row" justifyContent="center" height={1}>
            <For each={lineShortcuts}>
              {(shortcut, index) => (
                <>
                  <text style={{ fg: Colors.footer.key }}>{shortcut.key}</text>
                  <text style={{ fg: Colors.footer.text }}> {shortcut.label} </text>
                  {index() < lineShortcuts.length - 1 && (
                    <text style={{ fg: Colors.footer.separator }}>• </text>
                  )}
                </>
              )}
            </For>
          </box>
        )}
      </For>
    </box>
  );
}
