import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

type Violation = {
  file: string;
  line: number;
  text: string;
};

const rootDir = process.cwd();
const clientSrcDir = join(rootDir, "client", "src");

const violations: Violation[] = [];

const isCodeFile = (filePath: string) =>
  filePath.endsWith(".tsx") || filePath.endsWith(".ts");

const walk = (dir: string) => {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath);
    } else if (stats.isFile() && isCodeFile(fullPath)) {
      checkFile(fullPath);
    }
  }
};

const checkFile = (filePath: string) => {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!line.includes("bg-white")) return;
    if (
      line.includes("<input") ||
      line.includes("<textarea") ||
      line.includes("<select") ||
      line.includes("<Input") ||
      line.includes("<Textarea") ||
      line.includes("<Select")
    ) {
      violations.push({
        file: filePath,
        line: index + 1,
        text: line.trim(),
      });
    }
  });

  if (
    content.includes("background-color: #fff") ||
    content.includes("background-color:#fff") ||
    content.includes("background-color: white")
  ) {
    violations.push({
      file: filePath,
      line: 0,
      text: "background-color set to white",
    });
  }
};

walk(clientSrcDir);

if (violations.length > 0) {
  console.error("Found white input backgrounds that violate dark theme rules:");
  for (const violation of violations) {
    const location = violation.line ? `${violation.file}:${violation.line}` : violation.file;
    console.error(`${location} -> ${violation.text}`);
  }
  process.exit(1);
} else {
  console.log("Dark theme check passed: no white input backgrounds detected.");
}

