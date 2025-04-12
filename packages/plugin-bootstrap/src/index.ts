import type { Plugin } from "@elizaos/core/public-api";
import { continueAction } from "./actions/continue";
import { followRoomAction } from "./actions/followRoom";
import { ignoreAction } from "./actions/ignore";
import { muteRoomAction } from "./actions/muteRoom";
import { noneAction } from "./actions/none";
import { unfollowRoomAction } from "./actions/unfollowRoom";
import { unmuteRoomAction } from "./actions/unmuteRoom";
import { factEvaluator } from "./evaluators/fact";
import { goalEvaluator } from "./evaluators/goal";
import { boredomProvider } from "./providers/boredom";
import { factsProvider } from "./providers/facts";
import { timeProvider } from "./providers/time";

export * as actions from "./actions";
export * as evaluators from "./evaluators";
export * as providers from "./providers";

export const bootstrapPlugin: Plugin = {
    name: "bootstrap",
    description: "Agent bootstrap with basic actions and evaluators",
    actions: [
        continueAction,
        followRoomAction,
        unfollowRoomAction,
        ignoreAction,
        noneAction,
        muteRoomAction,
        unmuteRoomAction,
    ],
    evaluators: [factEvaluator, goalEvaluator],
    providers: [boredomProvider, timeProvider, factsProvider],
};
export default bootstrapPlugin;
