import { mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";

export class JsonlRecorder {
  private path: string;

  constructor(filename: string) {
    this.path = join(process.cwd(), "data", filename);
    mkdirSync(dirname(this.path), { recursive: true });
  }

  write(row: unknown): void {
    appendFileSync(this.path, `${JSON.stringify(row)}\n`);
  }

  filePath(): string {
    return this.path;
  }
}
