import { For, Show } from "solid-js";
import { Colors } from "@/theme/colors";
import { Footer } from "./Footer";
import { Modal } from "./Modal";

export interface DebugMessage {
  timestamp: number;
  message: string;
  type: "info" | "warn" | "error";
}

export interface DebugPopupProps {
  visible: boolean;
  messages: DebugMessage[];
}

export function DebugPopup(props: DebugPopupProps) {
  const maxVisibleMessages = 15;

  const getMessageColor = (type: DebugMessage["type"]) => {
    switch (type) {
      case "error":
        return Colors.text.error;
      case "warn":
        return Colors.text.warning;
      default:
        return Colors.text.secondary;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <Modal title="Debug Log" visible={props.visible} width={80}>
      <box flexDirection="column">
        {/* Messages list */}
        <box flexDirection="column" height={maxVisibleMessages}>
          <Show
            when={props.messages.length > 0}
            fallback={<text style={{ fg: Colors.text.secondary }}>No debug messages</text>}
          >
            <For each={props.messages.slice(-maxVisibleMessages)}>
              {(msg) => (
                <box>
                  <text style={{ fg: Colors.text.dim }}>[{formatTimestamp(msg.timestamp)}] </text>
                  <text style={{ fg: getMessageColor(msg.type) }}>{msg.message}</text>
                </box>
              )}
            </For>
          </Show>
        </box>

        <Footer shortcuts={[[{ key: "esc", label: "close" }]]} />
      </box>
    </Modal>
  );
}
