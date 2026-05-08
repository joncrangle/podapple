import { createSignal, onCleanup, onMount } from "solid-js";
import { Colors } from "@/theme/colors";
import { getSpinnerFrame, getSpinnerStyle, type SpinnerVariant } from "@/utils/spinners";

export interface SpinnerProps {
	active: boolean;
	label?: string;
	variant?: SpinnerVariant;
}

export function Spinner(props: SpinnerProps) {
	const [frameIndex, setFrameIndex] = createSignal(0);

	const getInterval = () => getSpinnerStyle(props.variant).interval;

	onMount(() => {
		if (!props.active) return;

		const interval = setInterval(() => {
			setFrameIndex((i) => i + 1);
		}, getInterval());

		onCleanup(() => clearInterval(interval));
	});

	// Effect to handle active changes
	let intervalId: ReturnType<typeof setInterval> | null = null;

	const startAnimation = () => {
		if (intervalId) return;
		intervalId = setInterval(() => {
			setFrameIndex((i) => i + 1);
		}, getInterval());
	};

	const stopAnimation = () => {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	};

	onMount(() => {
		if (props.active) {
			startAnimation();
		}
	});

	onCleanup(() => stopAnimation());

	const spinnerChar = () => getSpinnerFrame(frameIndex(), props.variant);

	if (!props.active) return null;

	return (
		<box flexDirection='row'>
			<text style={{ fg: Colors.text.accent }}>{spinnerChar()}</text>
			{props.label && <text style={{ fg: Colors.text.primary }}> {props.label}</text>}
		</box>
	);
}
