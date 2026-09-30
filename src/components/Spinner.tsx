import { createSignal, onSettled } from "solid-js";
import { Colors } from "@/theme/colors";
import { getSpinnerFrame, getSpinnerStyle, type SpinnerVariant } from "@/utils/spinners";

export interface SpinnerProps {
	label?: string;
	variant?: SpinnerVariant;
}

export function Spinner(props: SpinnerProps) {
	const [frameIndex, setFrameIndex] = createSignal(0);

	const getInterval = () => getSpinnerStyle(props.variant).interval;

	onSettled(() => {
		const intervalId = setInterval(() => {
			setFrameIndex((i) => i + 1);
		}, getInterval());

		return () => clearInterval(intervalId);
	});

	const spinnerChar = () => getSpinnerFrame(frameIndex(), props.variant);

	return (
		<box flexDirection='row'>
			<text style={{ fg: Colors.text.accent }}>{spinnerChar()}</text>
			{props.label && <text style={{ fg: Colors.text.primary }}> {props.label}</text>}
		</box>
	);
}
