import type { ScrollBoxRenderable } from "@opentui/core";
import { For, Show } from "solid-js";
import { Colors } from "@/theme/colors";
import type { PodcastEpisode } from "@/types/podcast";
import { EpisodeItem } from "./EpisodeItem";
import { Footer } from "./Footer";

export interface EpisodeListProps {
  title: string;
  episodes: PodcastEpisode[];
  selectedIndex: number;
  focused: boolean;
  loading?: boolean;
  width?: number | `${number}%` | "auto";
  flexGrow?: number;
}

/**
 * Component for displaying a scrollable list of podcast episodes.
 * Supports focus, selection, and contextual footer shortcuts.
 */
export function EpisodeList(props: EpisodeListProps) {
  let scrollBoxRef: ScrollBoxRenderable | undefined;

  const borderColor = () => (props.focused ? Colors.border.focused : Colors.border.unfocused);
  const backgroundColor = () => (props.focused ? Colors.focused : Colors.background);

  return (
    <box
      flexDirection="column"
      flexGrow={props.flexGrow ?? 1}
      flexBasis={0}
      flexShrink={1}
      maxHeight="100%"
      width={props.width ?? "50%"}
      backgroundColor={backgroundColor()}
      padding={1}
      borderStyle="rounded"
      borderColor={borderColor()}
      style={{ marginLeft: 1, marginRight: 1 }}
    >
      {/* Title bar */}
      <box
        height={1}
        style={{
          backgroundColor: Colors.header.background,
          paddingLeft: 1,
          paddingRight: 1,
        }}
        flexDirection="row"
        justifyContent="space-between"
        alignSelf="center"
      >
        <text style={{ fg: Colors.header.text }}>{props.title}</text>
      </box>

      {/* Episode list area */}
      <scrollbox
        flexGrow={1}
        ref={scrollBoxRef}
        focused={props.focused}
        scrollbarOptions={{
          trackOptions: {
            foregroundColor: Colors.list.scrollBarThumb,
            backgroundColor: Colors.list.scrollBarTrack,
          },
        }}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={1}
        paddingRight={1}
        contentOptions={{
          flexDirection: "column",
        }}
      >
        <Show
          when={!props.loading}
          fallback={
            <box style={{ paddingLeft: 1 }}>
              <text style={{ fg: Colors.text.primary }}>Loading...</text>
            </box>
          }
        >
          <box flexDirection="column">
            <Show
              when={props.episodes.length > 0}
              fallback={
                <box style={{ paddingLeft: 1 }}>
                  <text style={{ fg: Colors.text.primary }}>No podcasts found</text>
                </box>
              }
            >
              <For each={props.episodes}>
                {(episode, index) => (
                  <EpisodeItem
                    episode={episode}
                    isSelected={episode.selected}
                    isFocused={props.focused && index() === props.selectedIndex}
                  />
                )}
              </For>
            </Show>
          </box>
        </Show>
      </scrollbox>

      {/* Footer help area */}
      <Show when={props.focused}>
        <Show when={props.title.includes("Apple")}>
          <Footer
            shortcuts={[
              [
                { key: "space", label: "select" },
                { key: "a", label: "all" },
                { key: "esc", label: "deselect" },
                { key: "s", label: "sync" },
              ],
            ]}
          />
        </Show>
        <Show when={props.title.includes("Drive")}>
          <Footer
            shortcuts={[
              [
                { key: "space", label: "select" },
                { key: "a", label: "all" },
                { key: "esc", label: "deselect" },
                { key: "d", label: "delete" },
              ],
            ]}
          />
        </Show>
      </Show>
    </box>
  );
}
