export class InstallerError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "InstallerError";
    this.code = code;
  }
}

export function buildInstallerResult(action, releaseVersion, selectedSkills, skills) {
  return {
    action,
    releaseVersion,
    selectedSkills,
    applied: false,
    transactionId: null,
    preflightConflicts: skills.filter((skill) => skill.status === "conflict")
      .map((skill) => skill.name),
    skills: skills.map(({ name, destination, status }) => ({ name, destination, status })),
  };
}

export function emitInstallerResult(options, result) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (result.applied && !options.legacy) {
    emitAppliedResult(result);
    return;
  }
  const conflicts = result.preflightConflicts?.length > 0
    || result.skills.some((skill) => skill.status === "conflict");
  if (conflicts && options.action !== "preview") {
    for (const skill of result.skills) process.stdout.write(`${skill.status} ${skill.name}\n`);
    process.stdout.write("Installation blocked by conflicts.\n");
    return;
  }
  if (options.legacy || options.action === "preview") {
    const label = options.action === "preview" ? "Would install" : "Installing";
    for (const skill of result.skills) process.stdout.write(`${label} ${skill.name} -> ${skill.destination}\n`);
    const summary = options.action === "preview" ? "Plan" : "Installed";
    process.stdout.write(`${summary} ${result.skills.length} skill(s) for ${options.cli} (${options.scope}).\n`);
    return;
  }
  for (const skill of result.skills) process.stdout.write(`${skill.status} ${skill.name}\n`);
}

export function emitInstallerError(error, json) {
  const typed = error instanceof InstallerError
    ? error
    : new InstallerError("INSTALLER_ERROR", safeMessage(error));
  if (json) {
    process.stderr.write(`${JSON.stringify({
      error: { code: typed.code, message: typed.message },
    })}\n`);
    return;
  }
  process.stderr.write(`${typed.message}\n`);
}

export function installerCheckExitCode(skills) {
  if (skills.some((skill) => skill.status === "conflict")) return 3;
  if (skills.some((skill) => ["missing", "adoptable", "upgradeable"].includes(skill.status))) return 2;
  return 0;
}

function emitAppliedResult(result) {
  if (result.action === "rollback") {
    process.stdout.write(`Rolled back transaction ${result.transactionId}.\n`);
    return;
  }
  const verb = result.action === "force" ? "Forced" : "Applied";
  process.stdout.write(`${verb} ${result.skills.length} skill(s) in transaction ${result.transactionId}.\n`);
}

function safeMessage(error) {
  return typeof error?.message === "string" && error.message.length > 0
    ? error.message
    : "Installer failed.";
}
