import { rm } from "node:fs/promises";
import { type BunPlugin, build } from "bun";
import solidPlugin from "../node_modules/@opentui/solid/scripts/solid-plugin";
import pkg from "../package.json";

// Ensure clean dist
await rm("dist", { recursive: true, force: true }).catch(() => {});

// Parse args: bun scripts/build.ts [target] [outfile]
// Binary Build (Single Target via CLI args, usually from GoReleaser)
const targetArg = process.argv[2] || "native";

// Validate target against allowed Bun targets
type BunTarget =
	| "bun-linux-x64"
	| "bun-linux-arm64"
	| "bun-darwin-x64"
	| "bun-darwin-arm64"
	| "bun-windows-x64";
let target: BunTarget;

if (targetArg === "native") {
	target = `bun-${process.platform}-${process.arch}` as BunTarget;
} else {
	// Map GoReleaser names to Bun names if necessary
	const normalized = targetArg.replace("amd64", "x64");
	if (!normalized.startsWith("bun-")) {
		throw new Error(`Invalid target format: ${normalized}. Must start with 'bun-'`);
	}
	target = normalized as BunTarget;
}

const outfile = process.argv[3] || "dist/podapple";

console.log(`🚀 Building Binary...`);
console.log(`• Target: ${target}`);
console.log(`• Output: ${outfile}`);

await build({
	entrypoints: ["./src/index.tsx", "./src/services/workers/db.worker.ts"],
	target: "bun",
	plugins: [solidPlugin as BunPlugin],
	minify: true,
	compile: {
		target: target,
		outfile,
		autoloadBunfig: false,
		autoloadDotenv: false,
		autoloadTsconfig: true,
		autoloadPackageJson: true,
	},
	define: {
		"process.env.VERSION": JSON.stringify(pkg.version),
	},
});
console.log("✅ Binary build complete");
