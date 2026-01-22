import { EpisodeList } from "@/components/EpisodeList";
import { state } from "@/store";
import { hasNerdFont } from "@/utils/terminal";

export const PodcastView = (props: {
  width: number | `${number}%` | "auto";
  flexGrow?: number;
}) => {
  return (
    <EpisodeList
      title={hasNerdFont() ? " Apple Podcasts" : "Apple Podcasts"}
      episodes={state.macPodcasts}
      selectedIndex={state.macIndex}
      focused={state.focusedPane === "mac" && state.appView === "normal"}
      loading={state.loadingMac}
      width={props.width}
      flexGrow={props.flexGrow}
    />
  );
};
