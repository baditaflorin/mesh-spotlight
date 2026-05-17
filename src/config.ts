import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-spotlight",
  description: "Rotating spotlight: a new featured peer every 30 seconds, fairly drawn.",
  accentHex: "#f4cf45",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
