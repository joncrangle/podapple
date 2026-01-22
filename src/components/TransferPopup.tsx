import { createEffect, createSignal, Show } from "solid-js";
import { Spinner } from "@/components/Spinner";
import { Colors } from "@/theme/colors";
import { formatBytes, truncateString } from "@/utils/formatting";
import { calculateProgress, getProgressBar } from "@/utils/progress";
import { hasNerdFont } from "@/utils/terminal";
import { Footer } from "./Footer";
import { Modal } from "./Modal";

export interface TransferPopupProps {
  visible: boolean;
  currentFile: string;
  filesDone: number;
  totalFiles: number;
  bytesTransferred: number;
  totalBytes: number;
  speed: number;
}

/**
 * Modal component displaying the progress of a file transfer operation.
 * Shows progress bars, percentages, transfer speed, and counts.
 */
export function TransferPopup(props: TransferPopupProps) {
  const [lastFile, setLastFile] = createSignal("");

  createEffect(() => {
    if (props.currentFile && props.currentFile !== "Preparing...") {
      setLastFile(props.currentFile);
    }
  });

  const displayFile = () => props.currentFile || lastFile();

  const progress = () =>
    calculateProgress(props.filesDone, props.totalFiles, props.bytesTransferred, props.totalBytes);

  const progressBar = () => getProgressBar(progress());

  const percentage = () => Math.round(progress() * 100);

  return (
    <Modal
      title={hasNerdFont() ? "󰓦 Syncing" : " Syncing"}
      visible={props.visible}
      width={60}
      height={15}
    >
      <box flexDirection="column" alignItems="center" justifyContent="center" height="100%" gap={1}>
        {/* Current status */}
        <box width="100%" flexDirection="row" justifyContent="center">
          <text style={{ fg: Colors.text.primary }}>Transferring: </text>
          <text style={{ fg: Colors.text.accent }}>{truncateString(displayFile(), 40)}</text>
        </box>

        {/* Progress Bar Row */}
        <box flexDirection="row" alignItems="center" gap={1}>
          <text style={{ fg: Colors.progressBar.filled }}>{progressBar()}</text>
          <text style={{ fg: Colors.text.accent }}>{percentage()}%</text>
          <Show when={progress() < 1}>
            <Spinner active={true} variant="bouncingBall" />
          </Show>
        </box>

        {/* Stats */}
        <box flexDirection="row" gap={1}>
          <text style={{ fg: Colors.text.secondary }}>
            {props.filesDone}/{props.totalFiles} files
          </text>
          <text style={{ fg: Colors.footer.separator }}>•</text>
          <text style={{ fg: Colors.text.secondary }}>
            {(props.speed / 1024 / 1024).toFixed(1)} MB/s
          </text>
          <text style={{ fg: Colors.footer.separator }}>•</text>
          <text style={{ fg: Colors.text.secondary }}>
            {formatBytes(props.bytesTransferred)} / {formatBytes(props.totalBytes)}
          </text>
        </box>

        <Footer shortcuts={[[{ key: "esc", label: "cancel" }]]} />
      </box>
    </Modal>
  );
}
