import { EpisodeList } from "@/components/EpisodeList";
import type { useAppLogic } from "@/hooks/useAppLogic";
import { actions, state } from "@/store";
import { hasNerdFont } from "@/utils/terminal";

export const DriveView = (props: {
  width: number | `${number}%` | "auto";
  flexGrow?: number;
  logic: ReturnType<typeof useAppLogic>;
}) => {
  const handleFooterAction = (key: string) => {
    switch (key) {
      case "space":
        actions.toggleDriveSelection(state.driveIndex);
        break;
      case "a":
        actions.toggleAllDriveSelection();
        break;
      case "esc":
        actions.clearDriveSelection();
        break;
      case "d":
        if (state.drivePodcasts.some((p) => p.selected)) {
          actions.setAppView("confirm");
        }
        break;
    }
  };

  return (
    <EpisodeList
      width={props.width}
      flexGrow={props.flexGrow}
      title={hasNerdFont() ? " Drive Podcasts" : "Drive Podcasts"}
      episodes={state.drivePodcasts}
      selectedIndex={state.driveIndex}
      focused={state.focusedPane === "drive"}
      onItemClick={(index) => {
        if (state.focusedPane === "drive" && state.driveIndex === index) {
          actions.toggleDriveSelection(index);
        } else {
          actions.setFocusedPane("drive");
          actions.setDriveIndex(index);
        }
      }}
      onClick={() => actions.setFocusedPane("drive")}
      onFooterAction={handleFooterAction}
    />
  );
};
