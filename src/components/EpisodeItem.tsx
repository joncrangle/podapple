import { createMemo } from "solid-js";
import { Colors } from "@/theme/colors";
import type { PodcastEpisode } from "@/types/podcast";
import { getEpisodeDescription, getEpisodeTitle } from "@/utils/formatting";

export interface EpisodeItemProps {
	episode: PodcastEpisode;
	isSelected: boolean;
	isFocused: boolean;
	onClick?: () => void;
}

export function EpisodeItem(props: EpisodeItemProps) {
	const title = () => getEpisodeTitle(props.episode);
	const description = () => getEpisodeDescription(props.episode);

	const borderColor = createMemo(() => {
		if (props.isSelected) return Colors.list.markerSelected;
		if (props.isFocused) return Colors.list.markerUnfocused;
		return Colors.background;
	});

	const borderStyle = createMemo(() => {
		if (props.isSelected) return "heavy";
		return "single";
	});

	const getTitleColor = () => {
		if (props.isSelected && props.isFocused) return Colors.list.focusedSelected;
		if (props.isSelected) return Colors.list.selected;
		if (props.isFocused) return Colors.list.focused;
		return Colors.text.primary;
	};

	const getDescColor = () => {
		if (props.isSelected && props.isFocused) return Colors.list.focusedSelected;
		if (props.isSelected) return Colors.list.selected;
		if (props.isFocused) return Colors.list.focused;
		return Colors.text.secondary;
	};

	return (
		<box
			flexDirection='column'
			border={["left"]}
			borderStyle={borderStyle()}
			borderColor={borderColor()}
			paddingLeft={1}
			paddingRight={1}
			marginBottom={1}
			onMouseDown={() => {
				props.onClick?.();
			}}
		>
			<text style={{ fg: getTitleColor() }}>{title()}</text>
			<text style={{ fg: getDescColor() }}>{description()}</text>
		</box>
	);
}
