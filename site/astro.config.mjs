import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import fixReactVirtualized from "esbuild-plugin-react-virtualized";

// https://astro.build/config
export default defineConfig({
	integrations: [tailwind(), react()],
	vite: {
		optimizeDeps: {
			esbuildOptions: {
				plugins: [fixReactVirtualized],
			},
		},
	},
});
