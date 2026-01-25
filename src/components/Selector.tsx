import { createMemo, createSignal, For, Show } from "solid-js";
import { Colors } from "@/theme/colors";
import { Footer } from "./Footer";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";

export interface SelectorProps<T> {
  title: string;
  visible: boolean;
  loading?: boolean;
  items: T[];
  emptyText?: string;
  loadingText?: string;
  formatItem: (item: T) => { name: string; description?: string; color?: string };
  onSelect: (item: T) => void;
  onClose: () => void;
  onChange?: (item: T) => void;
  onIndexChange?: (index: number) => void;
  selectedIndex?: number;
  onShortcutClick?: (key: string) => void;
  extraShortcuts?: { key: string; label: string }[];
  width?: number | `${number}%` | "auto";
  height?: number | `${number}%` | "auto";
}

export function Selector<T>(props: SelectorProps<T>) {
  const [internalIndex, setInternalIndex] = createSignal(0);
  const [hoveredIndex, setHoveredIndex] = createSignal<number | null>(null);

  const currentIndex = createMemo(() =>
    props.selectedIndex !== undefined ? props.selectedIndex : internalIndex(),
  );

  const handleInteraction = (index: number, item: T) => {
    if (currentIndex() === index) {
      props.onSelect(item);
    } else {
      if (props.onIndexChange) {
        props.onIndexChange(index);
      } else {
        setInternalIndex(index);
        props.onChange?.(item);
      }
    }
  };

  return (
    <Modal
      title={props.title}
      visible={props.visible}
      width={props.width ?? 70}
      height={props.height}
      onClose={props.onClose}
    >
      <box flexDirection="column" gap={1} flexGrow={props.height ? 1 : 0}>
        <Show when={props.loading}>
          <Spinner active={true} label={props.loadingText || "Loading..."} />
        </Show>

        <Show when={!props.loading}>
          <Show
            when={props.items.length > 0}
            fallback={<text>{props.emptyText || "No items found"}</text>}
          >
            <scrollbox
              focused={true}
              height={props.height ? undefined : Math.min(props.items.length, 12)}
              flexGrow={props.height ? 1 : 0}
              scrollbarOptions={{
                trackOptions: {
                  backgroundColor: Colors.list.scrollBarTrack,
                },
              }}
            >
              <For each={props.items}>
                {(item, index) => {
                  const info = () => props.formatItem(item);
                  const isFocused = () => index() === currentIndex();
                  const isHovered = () => index() === hoveredIndex();

                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: TUI component
                    // biome-ignore lint/a11y/useKeyWithMouseEvents: TUI component
                    <box
                      flexDirection="column"
                      paddingLeft={1}
                      paddingRight={1}
                      border={["left"]}
                      borderStyle={isFocused() ? "heavy" : "single"}
                      borderColor={
                        isFocused() || isHovered() ? Colors.list.focused : Colors.border.unfocused
                      }
                      onMouseDown={() => handleInteraction(index(), item)}
                      onMouseOver={() => setHoveredIndex(index())}
                      onMouseOut={() => setHoveredIndex(null)}
                    >
                      <text
                        style={{
                          fg:
                            isFocused() || isHovered()
                              ? Colors.list.focused
                              : info().color || Colors.text.primary,
                        }}
                      >
                        {info().name}
                      </text>
                      <Show when={info().description}>
                        <text
                          style={{
                            fg: isFocused() ? Colors.list.focused : Colors.text.secondary,
                          }}
                        >
                          {info().description}
                        </text>
                      </Show>
                    </box>
                  );
                }}
              </For>
            </scrollbox>
          </Show>
        </Show>

        <Show when={!props.loading}>
          <Footer
            shortcuts={[
              [
                { key: "↑/↓", label: "navigate" },
                { key: "enter", label: "select" },
                { key: "esc", label: "close" },
                ...(props.extraShortcuts || []),
              ],
            ]}
            onShortcutClick={(key) => {
              if (key === "esc") props.onClose();
              props.onShortcutClick?.(key);
            }}
          />
        </Show>
      </box>
    </Modal>
  );
}
