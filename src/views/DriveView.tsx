import { EpisodeList } from "@/components/EpisodeList";
import { state } from "@/store";
import { hasNerdFont } from "@/utils/terminal";

export const DriveView = (props: { width: number | `${number}%` | "auto"; flexGrow?: number }) => {
  return (
    <EpisodeList
      title={hasNerdFont() ? " Drive Podcasts" : "Drive Podcasts"}
      episodes={state.drivePodcasts}
      selectedIndex={state.driveIndex}
      focused={state.focusedPane === "drive" && state.appView === "normal"}
      loading={state.loadingDrive}
      width={props.width}
      flexGrow={props.flexGrow}
    />
  );
};
