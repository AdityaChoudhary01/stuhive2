// @ts-nocheck
import cache from "@opennextjs/cloudflare/kvCache";
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
export default defineCloudflareConfig();

const config = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      incrementalCache: () => cache,
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
    },
  },
};

export default config;