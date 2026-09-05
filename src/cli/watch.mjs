import { startWatcher } from "../lib/watcher.mjs";
export async function run() {
  startWatcher();
  await new Promise(() => {});
}
