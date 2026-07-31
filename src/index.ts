import { runCli } from "./cli.js";

runCli(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
