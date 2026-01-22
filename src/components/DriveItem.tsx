import { Colors } from "@/theme/colors";
import type { Drive } from "@/types/drive";
import { formatDriveInfo } from "@/utils/drive";

export interface DriveItemProps {
  drive: Drive;
  selected: boolean;
}

export function DriveItem(props: DriveItemProps) {
  const backgroundColor = () => (props.selected ? Colors.list.focused : undefined);
  const textColor = () => (props.selected ? Colors.text.inverse : Colors.text.primary);

  return (
    <box flexDirection="row" paddingLeft={1} paddingRight={1} backgroundColor={backgroundColor()}>
      <text style={{ fg: textColor() }}>
        {props.selected ? "> " : "  "}
        {formatDriveInfo(props.drive)}
      </text>
    </box>
  );
}
