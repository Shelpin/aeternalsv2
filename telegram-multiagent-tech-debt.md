# Telegram Multi-Agent Plugin Technical Debt

This document tracks the issues and workarounds implemented for the telegram-multiagent plugin.

## Issues Identified

1. **Missing better-sqlite3 Package**
   - **Issue**: The plugin requires the better-sqlite3 package for SQLite functionality, but it was not included in the dependencies.
   - **Workaround**: Manually installed better-sqlite3 using `pnpm add better-sqlite3@^11.8.1 --save` in the telegram-multiagent package directory.
   - **Future Fix**: Add better-sqlite3 as a proper dependency in the package.json file.

2. **Configuration Not Being Loaded Correctly**
   - **Issue**: Changes to the configuration file (agent/config/plugins/telegram-multiagent.json) are not being picked up by the plugin during runtime.
   - **Workaround**: The configuration seems to be bundled during build time, so we need to rebuild the project after any configuration changes. However, even after rebuilding, the changes are not being picked up, suggesting a deeper issue with how the plugin loads its configuration.
   - **Future Fix**: Implement dynamic configuration loading that reads from the file at runtime rather than bundling it. Investigate why the configuration is not being updated even after rebuilding.

3. **Group IDs Not Being Set**
   - **Issue**: Despite setting groupIds in the configuration file, the plugin logs show an empty array for groupIds.
   - **Workaround**: Explicitly added the groupIds to the configuration file and rebuilt the project. Also added explicit `useSqliteAdapter: true` setting. However, this did not resolve the issue.
   - **Future Fix**: Investigate how the plugin reads the groupIds and ensure it correctly applies them from the configuration file.

4. **In-Memory SQLite Database**
   - **Issue**: The plugin is using an in-memory SQLite database (`:memory:`) instead of a persistent file-based database.
   - **Workaround**: Modified the configuration to use a file-based SQLite database at `/root/eliza/agent/data/telegram-multiagent.sqlite`, but this change was not picked up by the plugin.
   - **Future Fix**: Investigate why the dbPath setting is not being applied and fix the configuration loading mechanism.

5. **TypeScript Warnings**
   - **Issue**: The build process shows several TypeScript warnings related to type mismatches and missing parameters.
   - **Workaround**: These warnings are being ignored in "YOLO mode" during the build.
   - **Future Fix**: Address the TypeScript issues to ensure type safety and proper function calls.

## Build and Deployment Process

To properly build and deploy the plugin after making changes:

1. Stop all agents: `./stop_agents.sh`
2. Make necessary changes to code or configuration
3. Rebuild the specific plugin: `cd packages/telegram-multiagent && node build-yolo.js`
4. Rebuild the entire project: `cd /root/eliza && pnpm build`
5. Start the agents: `./start_agents.sh`

## Testing

To test the kickstarting functionality, you can send the command `/kickstart [optional topic]` in the Telegram group. This will force the agent to initiate a conversation.

## Current Status

- SQLite adapter is now successfully initializing with the better-sqlite3 package
- The plugin is still using in-memory SQLite database despite configuration changes
- Group IDs are still not being properly set, which may prevent the plugin from interacting with Telegram groups
- Kickstarting functionality needs to be tested with the `/kickstart` command in Telegram

## Recommended Next Steps

1. Investigate why configuration changes are not being picked up even after rebuilding
2. Consider modifying the plugin code directly to hardcode the correct settings if configuration loading cannot be fixed
3. Test the `/kickstart` command in Telegram to see if the plugin responds
4. Monitor the logs for any activity related to the Telegram integration 