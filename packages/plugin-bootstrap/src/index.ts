import type { Plugin } from "@elizaos/core";
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
