import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

export const repositoryPath = (...segments) => resolve(repositoryRoot, ...segments);

export const readRepositoryText = (relativePath) =>
  readFile(repositoryPath(relativePath), "utf8");

export const readRepositoryJson = async (relativePath) =>
  JSON.parse(await readRepositoryText(relativePath));

export const listSkillNames = async () => {
  const entries = await readdir(repositoryPath("skills"), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
};

export const parseFrontmatter = (markdown) => {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") {
    throw new Error("SKILL.md must start with YAML frontmatter");
  }

  const closingIndex = lines.indexOf("---", 1);
  if (closingIndex === -1) {
    throw new Error("SKILL.md frontmatter is not closed");
  }

  return Object.fromEntries(
    lines.slice(1, closingIndex).map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        throw new Error(`Invalid frontmatter line: ${line}`);
      }
      return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()];
    }),
  );
};

export const parseOpenAiInterface = (yaml) => {
  const entries = yaml
    .replaceAll("\r\n", "\n")
    .split("\n")
    .flatMap((line) => {
      const match = /^\s{2}(display_name|short_description|default_prompt):\s+"(.*)"\s*$/.exec(line);
      return match ? [[match[1], match[2]]] : [];
    });
  return Object.fromEntries(entries);
};

export const runNode = (argumentsList, options = {}) =>
  execFileAsync(process.execPath, argumentsList, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
