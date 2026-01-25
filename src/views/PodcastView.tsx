import { EpisodeList } from "@/components/EpisodeList";
import type { useAppLogic } from "@/hooks/useAppLogic";
import { actions, state } from "@/store";
import { hasNerdFont } from "@/utils/terminal";

export const PodcastView = (props: {
  width: number | `${number}%` | "auto";
  flexGrow?: number;
  logic: ReturnType<typeof useAppLogic>;
}) => {
  const handleFooterAction = (key: string) => {
    switch (key) {
      case "space":
        actions.toggleMacSelection(state.macIndex);
        break;
      case "a":
        actions.toggleAllMacSelection();
        break;
      case "esc":
        actions.clearMacSelection();
        break;
      case "s":
        if (state.macPodcasts.some((p) => p.selected)) {
          props.logic.startSync(state.macPodcasts.filter((p) => p.selected));
        }
        break;
    }
  };

  return (
    <EpisodeList
      width={props.width}
      flexGrow={props.flexGrow}
      title={hasNerdFont() ? " Apple Podcasts" : "Apple Podcasts"}
      episodes={state.macPodcasts}
      selectedIndex={state.macIndex}
      focused={state.focusedPane === "mac"}
      onItemClick={(index) => {
        if (state.focusedPane === "mac" && state.macIndex === index) {
          actions.toggleMacSelection(index);
        } else {
          actions.setFocusedPane("mac");
          actions.setMacIndex(index);
        }
      }}
      onClick={() => actions.setFocusedPane("mac")}
      onFooterAction={handleFooterAction}
    />
  );
};
