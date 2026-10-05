/**
 * Add extra sample branches (DEMO02, DEMO03, ...) with 6 months of payroll to
 * an agent, e.g. for a showcase/test account. Same data path as the
 * onboarding seed: flagged `isDemo`, excluded from the branch limit, and
 * removed by "Remove sample data" or the agent's first real upload.
 *
 * Defaults to dry-run. Pass `--confirm` to execute writes.
 *
 * Usage:
 *   npx tsx scripts/add-demo-branches.ts <email> [count=3]            # dry run
 *   npx tsx scripts/add-demo-branches.ts <email> [count=3] --confirm  # execute
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { addDemoBranch } from "../src/lib/demo/seed";
import { demoBranchCode, MAX_DEMO_BRANCHES } from "../src/lib/demo/dataset";

async function main() {
  const [email, countArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const confirm = process.argv.includes("--confirm");
  const count = Number(countArg ?? 3);
  if (!email || !Number.isInteger(count) || count < 1) {
    throw new Error("Usage: add-demo-branches.ts <email> [count] [--confirm]");
  }

  const agent = await prisma.agent.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, branches: { where: { isDemo: true }, select: { code: true } } },
  });
  if (!agent) throw new Error(`No agent ${email}`);

  const existing = new Set(agent.branches.map((b) => b.code));
  const todo: number[] = [];
  for (let i = 1; i < MAX_DEMO_BRANCHES && todo.length < count; i++) {
    if (!existing.has(demoBranchCode(i))) todo.push(i);
  }
  if (todo.length < count) {
    throw new Error(`Only ${todo.length} more sample branches available (max ${MAX_DEMO_BRANCHES} total)`);
  }

  console.log(`${email}: has [${[...existing].join(", ")}], adding [${todo.map(demoBranchCode).join(", ")}]`);
  if (!confirm) return console.log("Dry run. Re-run with --confirm to write.");

  for (const i of todo) {
    const t = Date.now();
    await addDemoBranch(agent.id, i);
    console.log(`  ${demoBranchCode(i)} added in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
