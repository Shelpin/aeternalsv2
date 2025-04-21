import type {
    IAgentRuntime,
    Goal,
    Objective,
    UUID,
} from './types.js';

/**
 * Get all goals for an agent in a given room.
 */
export async function getGoals({
    runtime,
    roomId,
    userId,
    onlyInProgress,
    count,
}: {
    runtime: IAgentRuntime;
    roomId: string;
    userId?: string;
    onlyInProgress?: boolean;
    count?: number;
}): Promise<any[]> {
    return runtime.databaseAdapter.getGoals({
        agentId: runtime.agentId,
        roomId,
        userId,
        onlyInProgress,
        count,
    });
}

export const formatGoalsAsString = ({ goals }: { goals: Goal[] }) => {
    const goalStrings = goals.map((goal: Goal) => {
        const header = `Goal: ${goal.name}\nid: ${goal.id}`;
        const objectives =
            "Objectives:\n" +
            goal.objectives
                .map((objective: Objective) => {
                    return `- ${objective.completed ? "[x]" : "[ ]"} ${objective.description} ${objective.completed ? " (DONE)" : " (IN PROGRESS)"}`;
                })
                .join("\n");
        return `${header}\n${objectives}`;
    });
    return goalStrings.join("\n");
};

export const updateGoal = async ({
    runtime,
    goal,
}: {
    runtime: IAgentRuntime;
    goal: Goal;
}) => {
    return runtime.databaseAdapter.updateGoal(goal);
};

export const createGoal = async ({
    runtime,
    goal,
}: {
    runtime: IAgentRuntime;
    goal: Goal;
}) => {
    return runtime.databaseAdapter.createGoal(goal);
};
