import { useTerminalDimensions } from "@opentui/solid";
import { createMemo, type JSX, Show } from "solid-js";
import { Colors } from "@/theme/colors";

export interface ModalProps {
  title: string;
  visible: boolean;
  width?: number | `${number}%` | "auto";
  height?: number | `${number}%` | "auto";
  maxHeight?: number | `${number}%` | "auto";
  children: JSX.Element;
  onClose?: () => void;
}

export function Modal(props: ModalProps) {
  const terminal = useTerminalDimensions();
  let isContentClick = false;

  const width = createMemo(() => {
    const w = props.width ?? 50;
    const maxW = terminal().width;
    const titleWidth = props.title.length + 4; // Title + padding + buffer

    if (typeof w === "number") {
      // Ensure modal doesn't overflow screen width, but is at least wide enough for title
      return Math.min(Math.max(w, titleWidth), Math.max(0, maxW - 2));
    }
    return w;
  });

  return (
    <Show when={props.visible}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: TUI component */}
      <box
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        zIndex={999}
        onMouseDown={() => {
          if (!isContentClick) {
            props.onClose?.();
          }
          isContentClick = false;
        }}
      >
        {/* Modal content box */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: TUI component */}
        <box
          // Prevent clicks from propagating to the overlay and closing the modal
          onMouseDown={() => {
            isContentClick = true;
          }}
          flexDirection="column"
          width={width()}
          height={props.height}
          maxHeight={props.maxHeight ?? "80%"}
          backgroundColor={Colors.popup.background}
          borderStyle="rounded"
          borderColor={Colors.popup.border}
        >
          {/* Title bar */}
          <box
            style={{
              backgroundColor: Colors.header.background,
              paddingLeft: 1,
              paddingRight: 1,
            }}
            position="absolute"
            top={-1}
            alignSelf="center"
            height={1}
          >
            <text style={{ fg: Colors.header.text }}>{props.title}</text>
          </box>

          {/* Content */}
          <box flexDirection="column" padding={1} flexGrow={props.height ? 1 : 0}>
            {props.children}
          </box>
        </box>
      </box>
    </Show>
  );
}
