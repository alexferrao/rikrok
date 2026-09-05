import { startFeed } from "../../server/feed.mjs";
export async function run(args) {
  const port = args.port ? Number(args.port) : undefined;
  const bind = typeof args.bind === "string" ? args.bind : undefined;
  await startFeed({ port, bind });
  await new Promise(() => {});
}
