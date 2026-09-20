import { db, schema } from "../src/db";
import { and, eq, isNull } from "drizzle-orm";
import { newId } from "../src/lib/id";
import { defaultSpec } from "../src/lib/agentSpec";
import type { FaceConfig } from "../src/lib/types";

/** Core roster — names, hues and face configs are verbatim from the prototype's CORE_ROSTER. */
const CORE: Array<{
  id: string;
  name: string;
  role: string;
  specialty: string;
  hue: number;
  face: FaceConfig;
}> = [
  {
    id: "atlas",
    name: "Elena",
    role: "Team lead",
    specialty: "Plans each mission and delegates to the team",
    hue: 220,
    face: { skin: "#E8B98F", hairColor: "#4A3226", style: "bob", headset: true },
  },
  {
    id: "scout",
    name: "Marcus",
    role: "Researcher",
    specialty: "Finds and grounds the facts",
    hue: 174,
    face: { skin: "#8D5A3B", hairColor: "#1E1A16", style: "short" },
  },
  {
    id: "forge",
    name: "Kenji",
    role: "Builder",
    specialty: "Drafts structures, code, and concrete plans",
    hue: 28,
    face: { skin: "#F0C99B", hairColor: "#20242B", style: "spiky" },
  },
  {
    id: "prism",
    name: "Priya",
    role: "Analyst",
    specialty: "Weighs trade-offs and stress-tests ideas",
    hue: 262,
    face: { skin: "#B97F55", hairColor: "#26180F", style: "long", glasses: true },
  },
  {
    id: "quill",
    name: "Sofia",
    role: "Writer",
    specialty: "Shapes findings into the final narrative",
    hue: 338,
    face: { skin: "#F2D6B3", hairColor: "#7A3B1E", style: "wavy", earring: true },
  },
  {
    id: "warden",
    name: "Theo",
    role: "Reviewer",
    specialty: "Checks quality and flags risks",
    hue: 135,
    face: { skin: "#6B4630", hairColor: "#141210", style: "buzz", beard: true },
  },
];

const WORKFLOWS = [
  {
    name: "Tech decision brief",
    prompt:
      "Compare two reasonable technical approaches for the problem I care about most in a live agent dashboard (state sync strategy), and recommend one with justification.",
    teamAgentIds: JSON.stringify(["scout", "prism", "quill"]),
  },
  {
    name: "Feature launch plan",
    prompt:
      "Draft a launch plan for a new dashboard feature: scope, milestones, risks, and a announcement blurb.",
    teamAgentIds: null, // Elena picks the team
  },
];

async function main() {
  // Self-healing: seed whenever the roster is empty, regardless of how the
  // database file came to exist. Never touches a non-empty roster.
  const existingAgents = await db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .limit(1);
  if (existingAgents.length > 0) {
    // Backfill photorealistic portraits for core agents seeded before avatarUrl existed.
    for (const a of CORE) {
      await db
        .update(schema.agents)
        .set({ avatarUrl: `/avatars/${a.id}.jpg` })
        .where(and(eq(schema.agents.id, a.id), isNull(schema.agents.avatarUrl)));
    }
    console.log("Agents table not empty — backfilled core avatar URLs, skipping seed.");
    return;
  }

  for (const a of CORE) {
    const spec = defaultSpec(a.name, a.role, a.specialty, {
      maxSteps: a.id === "atlas" ? 20 : 12,
    });
    await db
      .insert(schema.agents)
      .values({
        ...a,
        face: JSON.stringify(a.face),
        avatarUrl: `/avatars/${a.id}.jpg`,
        isCore: true,
        spec: JSON.stringify(spec),
        status: "active",
      })
      .onConflictDoUpdate({
        target: schema.agents.id,
        set: {
          name: a.name,
          role: a.role,
          specialty: a.specialty,
          hue: a.hue,
          face: JSON.stringify(a.face),
          avatarUrl: `/avatars/${a.id}.jpg`,
          isCore: true,
          spec: JSON.stringify(spec),
          status: "active",
        },
      });
  }

  const existing = await db.select({ id: schema.workflows.id }).from(schema.workflows);
  if (existing.length === 0) {
    for (const w of WORKFLOWS) {
      await db.insert(schema.workflows).values({ id: newId("wf_"), ...w });
    }
  }

  await db
    .insert(schema.settings)
    .values({ key: "kill_switch", value: "false" })
    .onConflictDoNothing();

  await db.insert(schema.events).values({
    id: newId("ev_"),
    seq: 0,
    type: "system.seeded",
    payload: JSON.stringify({ agents: CORE.length, workflows: WORKFLOWS.length }),
  });

  console.log(`Seeded ${CORE.length} core agents, ${WORKFLOWS.length} workflows (if empty).`);
}

main().then(() => process.exit(0));
