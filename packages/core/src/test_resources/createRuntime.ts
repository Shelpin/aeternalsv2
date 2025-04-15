import {
    SqliteDatabaseAdapter,
    loadVecExtensions,
} from "@elizaos/adapter-sqlite";
// import { SqlJsDatabaseAdapter } from "@elizaos/adapter-sqljs"; // Commented out - package not found
// import { SupabaseDatabaseAdapter } from "@elizaos/adapter-supabase"; // Commented out - package not found
// import { PGLiteDatabaseAdapter } from "@elizaos/adapter-pglite"; // Commented out - package not found
import type { DatabaseAdapter } from "../database";
import { getEndpoint } from "../models";
import { AgentRuntime } from "../runtime";
import { type Action, type Evaluator, ModelProviderName, type Provider } from "../types";
import {
    SUPABASE_ANON_KEY,
    SUPABASE_URL,
    TEST_EMAIL,
    TEST_PASSWORD,
    zeroUuid,
} from "./constants";
import type { User } from "./types";

/**
 * Creates a runtime environment for the agent.
 *
 * @param {Object} param - The parameters for creating the runtime.
 * @param {Record<string, string> | NodeJS.ProcessEnv} [param.env] - The environment variables.
 * @param {number} [param.conversationLength] - The length of the conversation.
 * @param {Evaluator[]} [param.evaluators] - The evaluators to be used.
 * @param {Action[]} [param.actions] - The actions to be used.
 * @param {Provider[]} [param.providers] - The providers to be used.
 * @returns {Object} An object containing the created user, session, and runtime.
 */
export async function createRuntime({
    env,
    conversationLength,
    evaluators = [],
    actions = [],
    providers = [],
}: {
    env?: Record<string, string> | NodeJS.ProcessEnv;
    conversationLength?: number;
    evaluators?: Evaluator[];
    actions?: Action[];
    providers?: Provider[];
}) {
    let adapter: DatabaseAdapter;
    let user: User;
    let session: {
        user: User;
    };

    switch (env?.TEST_DATABASE_CLIENT as string) {
        /* // Case commented out due to missing @elizaos/adapter-sqljs package
        case "sqljs":
            {
                const module = await import("sql.js");

                const initSqlJs = module.default;

                // SQLite adapter
                const SQL = await initSqlJs({});
                const db = new SQL.Database();

                adapter = new SqlJsDatabaseAdapter(db);

                // Load sqlite-vss
                loadVecExtensions((adapter as SqlJsDatabaseAdapter).db);
                // Create a test user and session
                session = {
                    user: {
                        id: zeroUuid,
                        email: "test@example.com",
                    },
                };
            }
            break;
        */
        /* // Case commented out due to missing @elizaos/adapter-supabase package
        case "supabase": {
            const module = await import("@supabase/supabase-js");

            const { createClient } = module;

            const supabase = createClient(
                env?.SUPABASE_URL ?? SUPABASE_URL,
                env?.SUPABASE_SERVICE_API_KEY ?? SUPABASE_ANON_KEY
            );

            const { data } = await supabase.auth.signInWithPassword({
                email: TEST_EMAIL!,
                password: TEST_PASSWORD!,
            });

            user = data.user as User;
            session = data.session as unknown as { user: User };

            if (!session) {
                const response = await supabase.auth.signUp({
                    email: TEST_EMAIL!,
                    password: TEST_PASSWORD!,
                });

                // Change the name of the user
                const { error } = await supabase
                    .from("accounts")
                    .update({ name: "Test User" })
                    .eq("id", response.data.user?.id);

                if (error) {
                    throw new Error(
                        "Create runtime error: " + JSON.stringify(error)
                    );
                }

                user = response.data.user as User;
                session = response.data.session as unknown as { user: User };
            }

            adapter = new SupabaseDatabaseAdapter(
                env?.SUPABASE_URL ?? SUPABASE_URL,
                env?.SUPABASE_SERVICE_API_KEY ?? SUPABASE_ANON_KEY
            );
            break;
        }
        */
        /* // Case commented out due to missing @elizaos/adapter-pglite package
        case "pglite":
            {
                // Import the PGLite adapter
                await import("@electric-sql/pglite");

                // PGLite adapter
                adapter = new PGLiteDatabaseAdapter({ dataDir: "../pglite" });

                // Create a test user and session
                session = {
                    user: {
                        id: zeroUuid,
                        email: "test@example.com",
                    },
                };
            }
            break;
        */
        case "sqlite":
        default:
            {
                const module = await import("better-sqlite3");

                const Database = module.default;

                // SQLite adapter - Cast to any to bypass linter error for now
                adapter = new SqliteDatabaseAdapter(new Database(":memory:")) as any;

                // Load sqlite-vss
                await loadVecExtensions((adapter as any).db);
                // Create a test user and session
                session = {
                    user: {
                        id: zeroUuid,
                        email: "test@example.com",
                    },
                };
                // Assign the user created in the default session
                user = session.user;
            }
            break;
    }

    // Ensure adapter is assigned before creating AgentRuntime
    if (!adapter) {
        throw new Error("Database adapter was not initialized.");
    }

    const runtime = new AgentRuntime({
        serverUrl: getEndpoint(ModelProviderName.OPENAI),
        conversationLength,
        token: env!.OPENAI_API_KEY!,
        modelProvider: ModelProviderName.OPENAI,
        actions: actions ?? [],
        evaluators: evaluators ?? [],
        providers: providers ?? [],
        databaseAdapter: adapter,
    });

    // Ensure user is assigned before returning
    if (!user) {
        // If supabase wasn't used and default didn't assign, handle this case
        // This might involve creating a default user or throwing an error
        // For now, let's re-assign from session as a fallback, though ideally structure guarantees assignment
        if (session?.user) {
            user = session.user;
        } else {
            throw new Error("User was not initialized.");
        }
    }

    return { user, session, runtime };
}
