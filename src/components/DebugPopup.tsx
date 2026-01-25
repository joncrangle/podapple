import { state } from "@/store";
import { Colors } from "@/theme/colors";
import { Selector } from "./Selector";

export interface DebugMessage {
  timestamp: number;
  message: string;
  type: "info" | "warn" | "error";
}

export interface DebugPopupProps {
  visible: boolean;
  messages: DebugMessage[];
  onClose: () => void;
  onShortcutClick?: (key: string) => void;
}

export function DebugPopup(props: DebugPopupProps) {
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
    <Selector
      title="Debug Log"
      visible={props.visible}
      items={props.messages}
      emptyText="No debug messages"
      width="85%"
      height="85%"
      selectedIndex={state.debugMenuIndex}
      onClose={props.onClose}
      onShortcutClick={props.onShortcutClick}
      onSelect={() => {}}
      formatItem={(msg) => ({
        name: `[${formatTimestamp(msg.timestamp)}] ${msg.message}`,
        color: getMessageColor(msg.type),
      })}
    />
  );
}
