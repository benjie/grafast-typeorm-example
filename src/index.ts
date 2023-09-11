import { writeFile } from "node:fs/promises";
import { grafast } from "grafast";
import { planToMermaid } from "grafast/mermaid";
import { ExecutionResult } from "graphql";
import { schema } from "./schema.js";
import { AppDataSource } from "./typeorm/data-source.js";
import { seedDatabase } from "./seed.js";

declare global {
  namespace Grafast {
    interface Context {
      viewerId: number | undefined;
    }
  }
}

async function main() {
  const db = await AppDataSource.initialize();
  await seedDatabase(db);

  const result = (await grafast({
    schema,
    source: /* GraphQL */ `
      query UserEventsScreen($id: Int!) {
        user(id: $id) {
          fullName
          username
          upcomingEvents {
            edges {
              node {
                id
                name
                viewerRsvp
                venue {
                  name
                }
                tags {
                  name
                }
                attendingFriendsOfViewer(first: 4) {
                  edges {
                    node {
                      picture(size: 25)
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    contextValue: {
      viewerId: 2,
    },
    variableValues: {
      id: 1,
    },
    resolvedPreset: {
      grafast: {
        explain: true,
      },
    },
  })) as ExecutionResult;

  console.dir(result.data, { depth: 100 });

  await writeFile(
    "plan.mermaid",
    planToMermaid((result.extensions?.explain as any)?.operations?.[0]?.plan, {
      skipBuckets: true,
      concise: true,
    }),
  );

  if (result.errors) {
    console.dir(result.errors, { depth: 100 });
    throw new Error(`GraphQL query raised an error`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
