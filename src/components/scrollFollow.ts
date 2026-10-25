import type { ScrollBoxRenderable } from "@opentui/core";
import { createRenderEffect } from "solid-js";

let scopeCounter = 0;

/**
 * Keeps the selected row of a `<scrollbox>` visible.
 *
 * Wire-up: pass `follow.ref` as the scrollbox `ref`, and spread
 * `follow.rowProps(() => index)` onto each row.
 *
 * Two triggers cover the two cases a plain effect cannot:
 * - the selected index changing (render effect; layout from the previous
 *   frame is still valid because rows keep their size when selected), and
 * - the selected row receiving its first layout (`onSizeChange`), which is
 *   when it is actually measurable on open or after the list is replaced.
 */
export function createScrollFollow(selectedIndex: () => number) {
	const scope = `scroll-follow-${scopeCounter++}`;
	let box: ScrollBoxRenderable | undefined;

	const rowId = (index: number) => `${scope}-row-${index}`;

	const sync = (index: number) => {
		box?.scrollChildIntoView(rowId(index));
	};

	createRenderEffect(selectedIndex, sync);

	return {
		ref: (el: ScrollBoxRenderable) => {
			box = el;
		},
		rowId,
		onRowLayout: (index: () => number) => () => {
			if (index() === selectedIndex()) sync(index());
		},
	};
}
