import { Show } from "solid-js";
import { Colors } from "@/theme/colors";

export interface HeaderProps {
	driveInfo: string;
	debugEnabled: boolean;
	lastKey: string | null;
	terminalDimensions?: { width: number; height: number };
	height?: number;
	onDriveClick?: () => void;
	onDebugClick?: () => void;
}

export function Header(props: HeaderProps) {
	const isSmallHeight = () => (props.height ?? props.terminalDimensions?.height ?? 100) <= 34;

	return (
		<box
			flexDirection='row'
			alignItems='center'
			style={{
				padding: isSmallHeight() ? 1 : 1,
				paddingTop: isSmallHeight() ? 0 : 1,
				paddingBottom: isSmallHeight() ? 0 : 1,
			}}
		>
			<Show when={props.debugEnabled}>
				<Show when={props.lastKey}>
					<box position='absolute' top={0} left={0} style={{ paddingLeft: 1 }}>
						<text style={{ fg: Colors.status.debug }}>Key: {props.lastKey}</text>
					</box>
				</Show>

				<Show when={props.terminalDimensions}>
					<box position='absolute' top={0} right={0} style={{ paddingRight: 1 }}>
						<text style={{ fg: Colors.status.debug }}>
							Size: {props.terminalDimensions?.width}x{props.terminalDimensions?.height}
						</text>
					</box>
				</Show>
			</Show>

			<box
				flexGrow={1}
				flexBasis={0}
				flexDirection='column'
				justifyContent='flex-end'
				style={{ height: isSmallHeight() ? 1 : 4, paddingBottom: isSmallHeight() ? 0 : 1 }}
				onMouseDown={() => props.onDebugClick?.()}
			>
				<Show when={props.debugEnabled}>
					<text style={{ fg: Colors.status.debug }}>DEBUG MODE</text>
				</Show>
				<Show when={!props.debugEnabled}>
					<box style={{ width: 1 }} />
				</Show>
			</box>

			<Show
				when={isSmallHeight()}
				fallback={
					<box
						style={{
							paddingLeft: 1,
							paddingRight: 1,
							height: 4,
						}}
					>
						<ascii_font text='PodApple' font='tiny' color={Colors.status.app} />
					</box>
				}
			>
				<text style={{ fg: Colors.status.app }}>PODAPPLE</text>
			</Show>

			<box
				flexGrow={1}
				flexBasis={0}
				flexDirection='column'
				justifyContent='flex-end'
				alignItems='flex-end'
				style={{ height: isSmallHeight() ? 1 : 4, paddingBottom: isSmallHeight() ? 0 : 1 }}
				onMouseDown={() => props.onDriveClick?.()}
			>
				<text style={{ fg: Colors.status.drive }}>{props.driveInfo || "No drives detected"}</text>
			</box>
		</box>
	);
}
