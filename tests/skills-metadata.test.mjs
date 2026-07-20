import assert from "node:assert/strict";
import test from "node:test";

import {
  listSkillNames,
  parseFrontmatter,
  parseOpenAiInterface,
  readRepositoryText,
} from "./helpers/repository.mjs";

const expectedSkillNames = [
  "binlee-clinic-operations",
  "binlee-compliance-risk",
  "binlee-consumer-decision",
  "binlee-doctor-ip",
  "binlee-help",
  "binlee-med-aesthetics-strategy",
  "binlee-public-communication",
  "binlee-source-library",
];

test("discovers the eight published skills", async () => {
  // Given the canonical skills directory
  // When the published skill folders are listed
  const actualSkillNames = await listSkillNames();

  // Then the repository exposes the expected public surface
  assert.deepEqual(actualSkillNames, expectedSkillNames);
});

test("keeps SKILL.md metadata aligned with each folder", async (context) => {
  const skillNames = await listSkillNames();

  for (const skillName of skillNames) {
    await context.test(skillName, async () => {
      // Given a published skill entry point
      const markdown = await readRepositoryText(`skills/${skillName}/SKILL.md`);

      // When its frontmatter is parsed
      const metadata = parseFrontmatter(markdown);

      // Then its identity and trigger description are complete
      assert.equal(metadata.name, skillName);
      assert.ok(metadata.description?.length > 20, "description must explain the trigger scope");
      assert.deepEqual(Object.keys(metadata).sort(), ["description", "name"]);
    });
  }
});

test("keeps OpenAI interface metadata complete and invocable", async (context) => {
  const skillNames = await listSkillNames();

  for (const skillName of skillNames) {
    await context.test(skillName, async () => {
      // Given a skill's OpenAI interface metadata
      const yaml = await readRepositoryText(`skills/${skillName}/agents/openai.yaml`);

      // When the supported interface fields are parsed
      const metadata = parseOpenAiInterface(yaml);

      // Then the UI labels exist and the starter prompt invokes the same skill
      assert.ok(metadata.display_name?.length > 0);
      assert.ok(metadata.short_description?.length > 0);
      assert.match(metadata.default_prompt ?? "", new RegExp(`\\$${skillName}(?:\\s|$)`));
    });
  }
});
