import type { Plugin } from "@elizaos/core/public-api.js";
import type {
    PluginContext,
    Action,
    Evaluator,
    Provider
} from "@elizaos/types";
import { continueAction } from "./actions/continue.js";
import { followRoomAction } from "./actions/followRoom.js";
import { ignoreAction } from "./actions/ignore.js";
import { muteRoomAction } from "./actions/muteRoom.js";
import { noneAction } from "./actions/none.js";
import { unfollowRoomAction } from "./actions/unfollowRoom.js";
import { unmuteRoomAction } from "./actions/unmuteRoom.js";
import { factEvaluator } from "./evaluators/fact.js";
import { goalEvaluator } from "./evaluators/goal.js";
import { boredomProvider } from "./providers/boredom.js";
import { factsProvider } from "./providers/facts.js";
import { timeProvider } from "./providers/time.js";

// Define the arrays of actions, evaluators, and providers separately
const bootstrapActions: Action[] = [
    continueAction,
    ignoreAction,
    noneAction,
    followRoomAction,
    unfollowRoomAction,
    muteRoomAction,
    unmuteRoomAction,
];
const bootstrapEvaluators: Evaluator[] = [goalEvaluator, factEvaluator];
const bootstrapProviders: Provider[] = [boredomProvider, timeProvider, factsProvider];

const elizaBootstrapPlugin: Plugin = {
    name: "@elizaos/plugin-bootstrap",
    version: "0.1.0", // Example version

    // Add required initialize and shutdown methods
    async initialize(context: PluginContext) {
        // TODO: Register actions, evaluators, providers using the context
        // Example: context.runtime.registerActions(bootstrapActions);
        // Example: context.runtime.registerEvaluators(bootstrapEvaluators);
        // Example: context.runtime.registerProviders(bootstrapProviders);
        context.runtime.logger.info(`Plugin ${this.name} initialized.`);
    },

    async shutdown() {
        // TODO: Add cleanup logic if needed
        console.log(`Plugin ${this.name} shutting down.`);
    },

    // Removed actions, evaluators, providers properties
    // They should be handled within initialize
};

export default elizaBootstrapPlugin;

// Export individual components if they need to be accessible directly elsewhere
export {
    bootstrapActions,
    bootstrapEvaluators,
    bootstrapProviders,
    continueAction,
    ignoreAction,
    noneAction,
    followRoomAction,
    unfollowRoomAction,
    muteRoomAction,
    unmuteRoomAction,
    goalEvaluator,
    factEvaluator,
    boredomProvider,
    factsProvider,
    timeProvider,
};
