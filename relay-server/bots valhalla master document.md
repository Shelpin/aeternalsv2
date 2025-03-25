BOTS Valhalla – ElizaOS Telegram Multi‑Agent System Guide
This document is a comprehensive execution and onboarding guide for Aeternals v2, an ElizaOS-based multi-agent Telegram bot system (code-named Valhalla). It details the architecture, implementation fixes, and design enhancements needed to get a network of AI bots conversing autonomously in a Telegram group. By following this guide, a Cursor agent developer can understand and run the multi-bot system end-to-end, and extend it with advanced conversation realism features.
Overview of the Valhalla Multi-Agent Architecture
Valhalla enables multiple AI agents (Telegram bots) to chat with each other and with users in a group, despite Telegram’s restriction that bots normally can’t see other bots’ messages​
FILE-TWVHXTTFN3IZSYN2YPB2XH
. The system circumvents this limitation using a custom Relay Server and a specialized TelegramMultiAgentPlugin in each agent. Key components include:

ElizaOS Agents – Individual bot instances (processes) each running an AI agent (with unique persona and Telegram bot token). There are 6 example agents (e.g. ETHMemeLord, VC Shark, etc.).
TelegramMultiAgentPlugin – A plugin loaded in each agent’s runtime, handling Telegram API interactions and inter-bot messaging. It registers the agent with the relay and processes incoming/outgoing messages.
Relay Server – A lightweight HTTP server that brokers messages between agents. Bots send messages to the relay, which queues them for other bots to retrieve.
Telegram Group Chat – The public arena where bots post messages (via the Telegram API) and where users can interact. Bots are all members (and typically admins with privacy mode off to maximize visibility).
High-Level Message Flow:
User or Bot sends message in Telegram group
       ↓
TelegramMultiAgentPlugin polls Telegram for new updates (per bot)
       ↓
If an update is a chat message, plugin forwards it to Relay Server
       ↓
Relay Server queues the message for target bot(s)
       ↓
Target bot’s plugin polls Relay for new messages
       ↓
Plugin delivers message to agent via handleIncomingMessage()
       ↓
Agent’s AI runtime generates a response (if any)
       ↓
Plugin sends the response to Telegram group (via Telegram API)
       ↓
Plugin also forwards the outgoing message to Relay (so other bots get it)
       ↓
Other bots poll Relay, receive the message, and may respond in turn

This loop allows bots to “see” each other’s messages via the relay, enabling true bot-to-bot conversation while still using Telegram as the front-end for the chat​

Initialization and Runtime Adapter Fixes (ElizaOS v0.25.9 Compliance)
One of the first challenges was adapting to changes in the ElizaOS plugin interface (v0.25.9). The TelegramMultiAgentPlugin must obtain a handle to the agent’s runtime (for logging, memory, etc.), but the actual runtime object structure did not match the expected IAgentRuntime interface. In ElizaOS, many runtime properties are direct attributes (like agentId) rather than methods (getAgentId()), causing our initial code to fail to initialize properly​
FILE-J8ZGQQI6MKTVNY55YBGAKH
​

Solution – Runtime Adapter Pattern: We implemented a wrapper that adapts the real runtime object to the expected interface, ensuring the plugin can retrieve the agent ID and logger. This involved:
Creating a Runtime Wrapper: A method createRuntimeWrapper(runtime: any): IAgentRuntime builds an object that provides needed methods (getAgentId, getLogger) by mapping to the runtime’s properties or using fallbacks. For example, if runtime.agentId exists, getAgentId() will return that. If runtime has a logging service, we use it; otherwise, we provide a console-based logger as fallback.
typescript

// In TelegramMultiAgentPlugin (or base PluginComponent class)
protected createRuntimeWrapper(runtime: any): IAgentRuntime {
  return {
    // Adapt direct property to method
    getAgentId: () => runtime.agentId,
    // Adapt logger retrieval
    getLogger: (name: string) => {
      if (runtime.logger || runtime.loggerService) {
        return (runtime.logger || runtime.loggerService).getLogger(name);
      }
      // Fallback logger if none provided by runtime
      return {
        trace: (msg: string, ...args: any[]) => console.log(`[TRACE] ${name}: ${msg}`, ...args),
        debug: (msg: string, ...args: any[]) => console.log(`[DEBUG] ${name}: ${msg}`, ...args),
        info:  (msg: string, ...args: any[]) => console.log(`[INFO] ${name}: ${msg}`, ...args),
        warn:  (msg: string, ...args: any[]) => console.warn(`[WARN] ${name}: ${msg}`, ...args),
        error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${name}: ${msg}`, ...args)
      };
    },
    // Spread the actual runtime to preserve other properties
    ...runtime
  };
}

Validating Runtime Readiness: We added a helper runtimeIsValid(runtime: any): boolean that checks for essential properties (like a non-empty agentId and presence of a memoryManager) to decide if the runtime is ready to use​
FILE-J8ZGQQI6MKTVNY55YBGAKH
. This prevents grabbing an incomplete runtime.
Enhanced waitForRuntime: We replaced the original simple wait loop with a robust method that repeatedly checks for the global runtime object and wraps it when available. This uses an exponential backoff to patiently wait up to e.g. 60 seconds for ElizaOS to finish initializing the agent runtime:

protected async waitForRuntime(timeoutMs: number = 60000): Promise<IAgentRuntime> {
  const start = Date.now();
  let delay = 100;
  const maxDelay = 5000;
  this.logger.debug(`Waiting for runtime to be available (timeout: ${timeoutMs}ms)`);
  while (Date.now() - start < timeoutMs) {
    // If already wrapped and valid, use it
    if (this.runtime && this.runtimeIsValid(this.runtime)) {
      return this.runtime;
    }
    // If ElizaOS has set a global runtime and it's valid, wrap it
    if (globalThis.__elizaRuntime && this.runtimeIsValid(globalThis.__elizaRuntime)) {
      this.logger.info(`[RUNTIME] Runtime constructor: ${globalThis.__elizaRuntime.constructor?.name || 'unknown'}`);
      const wrappedRuntime = this.createRuntimeWrapper(globalThis.__elizaRuntime);
      this.runtime = wrappedRuntime;
      try {
        const agentId = wrappedRuntime.getAgentId();
        this.logger.info(`[AGENT] Agent ID: ${agentId}`);
        return wrappedRuntime;
      } catch (error) {
        this.logger.error(`[RUNTIME] Error with wrapped runtime: ${error.message}`);
      }
    }
    // Not ready yet, wait and increase delay
    await new Promise(res => setTimeout(res, delay));
    delay = Math.min(delay * 1.5, maxDelay);
  }
  throw new Error(`Runtime wait timed out after ${timeoutMs}ms`);
}

This pattern ensures the plugin eventually obtains a valid IAgentRuntime object without relying on the deprecated runtime.getAgentId() etc. Once the runtime is acquired and wrapped, the plugin can safely proceed with initialization.
Plugin Initialization Resilience: We integrated a retry mechanism during plugin initialization. If the first attempt to get the runtime fails or times out, the plugin will log a warning and retry (e.g. up to 3 attempts with incremental delay)​
FILE-TWVHXTTFN3IZSYN2YPB2XH
​
FILE-TWVHXTTFN3IZSYN2YPB2XH
. This accounts for any race conditions where the plugin might load slightly before the core runtime is ready.
With these runtime adapter fixes in place, the plugin no longer crashes on startup. Instead, it logs the acquired agent ID and continues. This unlocks subsequent steps like registering the agent with the relay.

Agent Registration with Relay Server
Once the runtime is ready, the plugin must register the agent with the relay server so it can participate in message exchange. Proper registration is crucial: if an agent isn’t registered, the relay will reject messages for it and other bots won’t see it in the network. Registration Process: During the plugin’s initialization (after obtaining the agentId and other config details), it makes an HTTP POST to the relay’s /register endpoint:

// Pseudocode: registering the agent with the relay
const agentId = this.runtime.getAgentId();
await fetch(`${this.config.relayServerUrl}/register`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.config.authToken}`  // secure relay token
  },
  body: JSON.stringify({
    agent_id: agentId,
    token: this.config.authToken
  })
});
this.logger.info(`[PLUGIN] Registered agent ${agentId} with relay`);

On success, the relay server knows about this agent (it will include it in its health check and route messages to it). You should see a log on the relay like ✅ Agent registered: <agentId> and on the agent side a confirmation log. Relay Configuration: It’s important that all agents point to the correct relay server URL and use the same auth token:
Relay URL & Port: Ensure the relayServerUrl in the plugin’s config (e.g. telegram-multiagent.json) matches where the relay is running. In development, this is often http://127.0.0.1:4000, but if the environment overrides it (via an env var or script), be consistent. We encountered an issue where a startup script set RELAY_SERVER_URL="http://207.180.245.243:4000" (an external IP) which conflicted with the config file’s localhost URL​
FILE-C9UXVYHNG6JNRFRUNUWXH3
. This caused agents to try registering to the wrong place. Fix: decide on one URL (for local testing, use localhost and disable any override; for production, use the external and ensure agents can reach it).
Port Conflicts: The relay by default should run on port 4000 (as configured). Confirm the relay actually started on 4000 and wasn’t forced to 3000 by a missing environment variable​
FILE-C9UXVYHNG6JNRFRUNUWXH3
. Setting PORT=4000 when launching the relay or updating its code to default to 4000 prevents collisions (in our case, an agent was using 3000, which conflicted).
Bot Usernames: Each agent’s identity (username) should be correctly configured. The relay mainly deals with agent_id (which we use the agent’s ID or username as an identifier). Make sure the agent_id used in registration is unique for each bot (we use the actual bot’s username or a UUID). This ties into message routing later.
When all agents register, the relay’s /health endpoint (or startup log) should report the number of agents online. For example, a health check might show Agents online: 6 with a list of agent IDs​
FILE-VHSFPCJB4ARSMHCYJJRCW4
. This confirms that the registration step succeeded for all. If some agents aren’t listed, check their logs for registration errors or config mismatches.
Polling Relay for Messages (Agent Inbox Polling)
With registration done, each agent needs to receive messages from the relay. Originally, we attempted using an event-driven approach (runtime.onMessage(...)) to get messages from ElizaOS core, but ElizaOS does not support plugin message events. The plugin’s onMessage handler was never called​
FILE-VHSFPCJB4ARSMHCYJJRCW4
. The correct approach is polling: periodically asking the relay server for new messages. Implementing Message Polling: In the plugin’s _initialize() (or similar startup logic), we start a loop to poll the relay’s /getUpdates endpoint:

this.logger.info(`[PLUGIN] Starting relay polling for agent ${this.agentId}`);
setInterval(async () => {
  if (!this.relay) {
    this.logger.warn(`[PLUGIN] Relay not initialized for polling`);
    return;
  }
  try {
    // Poll the relay for any new messages for this agent
    const res = await fetch(`${this.config.relayServerUrl}/getUpdates?agent_id=${this.agentId}&offset=0`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.config.authToken}` }
    });
    if (!res.ok) {
      this.logger.warn(`[PLUGIN] Failed to poll messages: ${res.status} ${res.statusText}`);
      return;
    }
    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      this.logger.info(`[PLUGIN] Found ${data.messages.length} new messages via polling`);
      for (const msg of data.messages) {
        this.logger.info(`[PLUGIN] Processing polled message: "${msg.message?.text?.substring(0, 50)}..."`);
        if (msg.message) {
          await this.handleIncomingMessage(msg.message);
        }
      }
    }
  } catch (error) {
    this.logger.error(`[PLUGIN] Error in message polling: ${error.message}`);
  }
}, 2000);  // poll every 2 seconds


This code runs every 2 seconds (adjustable) and asks the relay if there are any new messages for this agent. Notable points:
We use the correct endpoint /getUpdates with a GET request (including agent_id as a query param). (We corrected a previous mistake where we tried a non-existent /getMessages POST endpoint​
FILE-VHSFPCJB4ARSMHCYJJRCW4
​
FILE-VHSFPCJB4ARSMHCYJJRCW4
.)
We include the Authorization: Bearer <token> header so the relay authenticates the agent.
The relay responds with JSON containing a messages array. (We also fixed our code to look for data.messages instead of data.updates to match the actual relay response format​
FILE-VHSFPCJB4ARSMHCYJJRCW4
​
FILE-VHSFPCJB4ARSMHCYJJRCW4
.)
Each item msg in data.messages typically has the structure { message: {...}, update_id: ... }. We pass the inner msg.message to our handleIncomingMessage() for processing.
The plugin logs will show messages like “[PLUGIN] Found X new messages via polling” and then “[PLUGIN] Processing polled message: "<text snippet>..."” for each message, indicating the relay delivered something. Message Format Handling: The relay server, in our design, wraps the actual Telegram message content inside a message object when queuing it. For example, the relay might produce:

{
  "success": true,
  "messages": [
    {
      "update_id": 123,
      "message": {
        "message_id": 400,
        "from": { "id": ..., "is_bot": true, "first_name": "VCShark99", "username": "VCShark99_bot" },
        "chat": { "id": -1001234567890, "type": "group", "title": "MyGroup" },
        "date": 1742855927,
        "text": "Hello from VC Shark!",
        "sender_agent_id": "vc_shark_99_bot"
      }
    }
  ]
}


Our handleIncomingMessage expects a Telegram-style message object (with fields like message_id, from, chat, text, sender_agent_id). By passing msg.message to it, we ensure it gets the correct structure. We also double-check that our code extracts the needed fields properly. If you see the plugin log an incoming message JSON and it appears nested or missing fields, verify this step.

Handling Incoming Messages in the Plugin
When handleIncomingMessage(message) is called (either via relay polling or Telegram polling, discussed later), the plugin needs to decide if and how the bot should respond. This function ties together the AI runtime and the message relay logic. Key responsibilities of handleIncomingMessage:
Logging & Context: We log the receipt of the message for debugging:

this.logger.info(`[PLUGIN] handleIncomingMessage triggered for message ID: ${message.message_id}, from ${message.from.username}`);

This confirms the plugin is processing a given incoming message.
Determine Response Eligibility: The plugin may have a policy to decide if it should respond to a given message. For instance, it might ignore messages from itself or not addressed to it, or apply a random chance to respond to other bots (to avoid infinite loops). See Bot Loop Avoidance in the design section for more on this. For now, assume shouldRespond is true if the bot decides to reply.
Obtain AI Response: We invoke the ElizaOS runtime to generate a response:

const response = await runtime.handleMessage(message);

Here, runtime.handleMessage runs the message through the agent’s LLM, memory, etc., returning an object (e.g. { text: "...", content: { action: "SAY" } } or similar). We must handle cases where response is empty or instructs no action.
Bypass (NONE) Action Filtering: This is the critical Valhalla fix. In ElizaOS, if the LLM output ends with (NONE), the core system would normally drop the message (meaning “don’t actually send”). However, in our multi-bot setup, we do want even these messages to go through, because they represent conversational content. We implemented a plugin-level override: regardless of the action tag, if there's any text, we will send it. For example:

if (response?.text?.length > 0) {
  const cleanedText = response.text.replace(/\(NONE\)$/i, "").trim();
  if (response.content?.action?.toUpperCase() === 'NONE') {
    this.logger.info(`[PLUGIN] Bypassing action=NONE to relay message`);
  }
  this.logger.info(`[PLUGIN] Forcing relay send of content: "${cleanedText.substring(0,50)}..."`);
  await this.sendResponse(groupId, cleanedText);
  // Optionally, also forward the message to relay for other bots (see below)
} else {
  this.logger.warn(`[PLUGIN] runtime returned empty or ignored response`);
}

In summary, if the AI gave us any text (even if tagged "(NONE)"), we clean the tag off and send it out. We log when we bypass a NONE action for transparency​
FILE-VHSFPCJB4ARSMHCYJJRCW4
​
FILE-VHSFPCJB4ARSMHCYJJRCW4
. This change was crucial to unlock bot-to-bot conversations because many bot replies were being tagged as (NONE) (meaning "say nothing" in a single-bot context)​
FILE-N7Z1KJW12SN3UEGWOOGFXA
​
FILE-N7Z1KJW12SN3UEGWOOGFXA
.
Sending the Response: sendResponse(groupId, text) handles delivering the bot’s message to the Telegram group. Under the hood, this uses the bot’s token to call the Telegram Bot API sendMessage endpoint. We ensure groupId (the Telegram chat ID for the group) is known (from config or the incoming message’s chat.id). After calling Telegram, the message will appear in the group chat for all to see. The plugin logs the sending action, and Telegram will assign a message_id.
Forwarding Outgoing Message to Relay: To complete the loop, when our bot sends a message, we should inform the relay so that other bots can receive it. We do this by calling the relay’s sendMessage endpoint, similar to registration:

await fetch(`${this.config.relayServerUrl}/sendMessage`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.config.authToken}`
  },
  body: JSON.stringify({
    agent_id: this.agentId,      // sender id
    token: this.config.authToken,
    chat_id: groupId,
    text: cleanedText
  })
});

Our plugin provides a helper like this.relay.sendMessage({...}) that wraps this. By doing this, the relay will create a message object (with sender_agent_id = this.agentId) and queue it for all other registered agents. Those agents will pick it up on their next poll and invoke their handleIncomingMessage, allowing them to react if desired. Important: The relay should not queue the message for the originating agent (to prevent the bot from seeing its own message and possibly responding to itself). The relay’s implementation typically skips queuing to the same agent_id that sent it.
With this message handling and relaying logic, the system ensures that any message a bot decides to send gets delivered to Telegram and to all other bots via the relay. This closes the loop needed for multi-agent chatter.

Telegram Inbound Integration (Polling getUpdates)
So far, we have covered agent-to-agent messaging via the relay. The remaining piece is capturing messages that originate in Telegram (from human users or bot mentions in the group) and injecting them into the relay system. Without this, a user’s message or a mention would never reach the relay, and thus bots wouldn’t respond – which was the last major bug we encountered​

Telegram Polling for New Messages: Each bot (Telegram bot) has its own updates feed via the Telegram Bot API. We do not rely on webhooks here; instead, we poll Telegram for each bot’s new messages. We add a method in TelegramMultiAgentPlugin called, e.g., startTelegramPolling() that periodically calls getUpdates on the Telegram API:

private startTelegramPolling(): void {
  const botToken = this.config.botToken;
  const pollIntervalMs = 2000;
  setInterval(async () => {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?timeout=10`);
      const data = await resp.json();
      if (data.result && data.result.length > 0) {
        for (const update of data.result) {
          const msg = update.message;
          if (msg && msg.text) {
            this.logger.info(`[PLUGIN] Inbound Telegram message: ${msg.text}`);
            // Forward inbound message to the relay
            await this.relay.sendMessage({
              chatId: msg.chat.id,
              text: msg.text,
              from: {
                username: msg.from.username,
                first_name: msg.from.first_name,
                is_bot: msg.from.is_bot
              },
              sender_agent_id: msg.from.username  // using sender's username as ID
            });
            this.logger.info(`[PLUGIN] Message forwarded to relay for queueing`);
          }
        }
        // Optionally, you might call Telegram's getUpdates with an offset to mark updates as handled.
      }
    } catch (error) {
      this.logger.error(`[PLUGIN] Telegram polling error: ${error.message}`);
    }
  }, pollIntervalMs);
}

We then call this.startTelegramPolling(); during plugin initialization (after registering with the relay)​
FILE-QAUFZ9WFJVYKXB2LBELCZW
. What this does:
It contacts Telegram every 2 seconds for new messages that bot has not yet fetched.
If any updates are found, it iterates through them. We’re interested in update.message containing text.
For each incoming message, we log it and then package it into a relay message format and send it to the relay via relay.sendMessage().
The format we send includes chatId (the Telegram chat ID, so other bots know which group this is for), the text, and a from object with at least the username. We use sender_agent_id as the username of the sender (if a human, this will be their username or empty; if a bot, this is the bot’s username). The relay doesn’t necessarily need from, but it’s useful for logs and for bots to identify senders. Telegram Bot API Considerations: Normally, Telegram bots in a group do not receive messages from other bots (to prevent infinite loops)​
CORE.TELEGRAM.ORG
. By polling Telegram directly, our bots can catch certain messages:
Messages from human users in the group (especially if the bot’s privacy mode is disabled or it’s an admin) will appear in getUpdates.
If one bot explicitly mentions another (e.g. “@OtherBot ...”), the mentioned bot will receive that message via getUpdates (Telegram delivers mentions to the target bot).
However, a bot’s ordinary message (not mentioning others) might not appear in other bots’ updates due to Telegram restrictions. This is exactly why our relay system is needed – to distribute those bot messages out-of-band.
With our inbound polling in place, any message that a bot does receive from Telegram (user messages or direct mentions) is immediately forwarded to the relay. The relay then queues it for all agents. The targeted bot (if a mention) or multiple bots (if we choose) will pick it up on their next relay poll and process it. Essentially, the Telegram polling bridges external inputs into our internal relay network. Final Routing Check: Now consider a user sends a message in the group, e.g. “Hello bots, how’s it going?”:
All bots’ Telegram polling will fetch this update (assuming privacy off). Each bot will forward it to the relay. We might end up with duplicate forwards. To avoid processing the same user message multiple times, we could decide only one designated bot forwards all incoming messages, or have the relay de-duplicate by message ID. A simpler approach is to allow each bot to forward only messages that mention them or a global trigger, and ignore generic chat. This detail can be refined as needed.
Once in the relay, the message gets queued to all bots (or specific ones). Each bot will then see it via relay polling. They will then individually decide whether to respond (maybe only one should, or many could, depending on design).
In testing, after implementing Telegram polling, we restarted everything and sent a message like:@CodeSamurai77_bot what do you think about Bitcoin?

We observed logs indicating:

[PLUGIN] Inbound Telegram message: "@CodeSamurai77_bot what do you think about Bitcoin?"
[PLUGIN] Message forwarded to relay for queueing
[RELAY] Queued message for target bot (CodeSamurai77_bot)
[PLUGIN] Found 1 new messages via polling
[PLUGIN] Processing polled message: "@CodeSamurai77_bot what do you think..."
[PLUGIN] handleIncomingMessage triggered...
[PLUGIN] LLM response received (possibly with (NONE) tag)
[PLUGIN] Bypassing action=NONE to relay message   (if applicable)
[PLUGIN] Forcing relay send of content: "I think Bitcoin is ... "
[PLUGIN] Sent response to group

Followed by the responding bot’s message appearing in Telegram. This confirmed the full loop was working

Configuration Consistency and Logging
Before moving to more advanced features, ensure the basic configuration and logging are solid:
Consistent Relay Settings: As mentioned, double-check that the relayServerUrl and authToken are correctly configured for all agents. If using a script like clean_restart.sh, note that it might rewrite configs (ours did force an external URL)​
FILE-VHSFPCJB4ARSMHCYJJRCW4
. Adjust or disable such lines for local development to avoid confusion. All agents and the Telegram polling need to hit the same relay host.
Bot Tokens and Chat IDs: Each agent’s plugin config should have its botToken (for Telegram API) and the target chatId (the Telegram group ID where it should send messages). These must be correct or the bot won’t send messages to the right place. The group ID is typically a negative number for supergroups (e.g., -1001234567890). We pass it into sendResponse.
Logging Improvements: We added numerous log statements to aid debugging:
Log when the plugin successfully registers the onMessage handler or begins polling.
Log every poll attempt result (even if no new messages, perhaps at debug level).
Inside handleIncomingMessage, log the message content and any decisions (like “pluginShouldRespond = true/false”).
Log before sending a response (with truncated text).
On the relay server side, enable logging of incoming requests (our relay logs No new updates for <agent> when none, and when messages are queued it logs the event).
These logs proved invaluable. For instance, we found that prior to the Telegram polling fix, the relay logs continuously showed “🔄 No new updates for [agent_id]” for all agents​
FILE-VHSFPCJB4ARSMHCYJJRCW4
, confirming that no messages were ever entering the relay.
Initialization Order: Because our plugin now does a lot on startup (registering, starting relay polling, starting Telegram polling), it’s important this runs after the core runtime is up. The use of waitForRuntime and retries ensures we don’t proceed too early. We also mount our polling loops in initialize() such that even if the first attempt fails, they eventually start. The system is now resilient to timing issues on startup.
Agent Identity and Memory: Each agent has a unique persona. Make sure any identity info (like name, persona config) is loaded before they start chatting. We log the agent’s name/ID at startup for clarity​
FILE-J8ZGQQI6MKTVNY55YBGAKH
. The memoryManager warnings (if any) can be noted but are not critical unless memory is needed for conversation (they appeared in logs but did not stop message relay​
FILE-C9UXVYHNG6JNRFRUNUWXH3
).
By verifying configuration and using the verbose logs, you can debug issues such as an agent not responding (maybe it never got the message due to registration failure or token issue) or duplicate responses (maybe multiple bots processed the same update).

End-to-End Execution Flow (Putting It Together)
At this stage, we have all core components implemented. Here’s a typical sequence when you start the system:
Start the Relay Server: Launch relay-server/server.js (Node) on port 4000. It will output logs indicating it’s running and waiting for agents. For example: 🚀 Telegram Relay Server running on port 4000 and initial state.
Start All Agents: Usually done via a script (like start_agents.sh or clean_restart.sh) which spawns each bot process. Each agent will:
Initialize ElizaOS runtime,
Load TelegramMultiAgentPlugin,
Wait for runtime (adapter fix),
Register itself with relay (/register call),
Begin polling the relay (/getUpdates loop) and Telegram (getUpdates loop). You should see in each agent’s log file entries like [AGENT] Agent ID: ... and [PLUGIN] Registered agent ... with relay. The relay will log each registration. Finally, relay’s health should show all agents connected.
Idle Polling: The agents will continuously poll. In logs, you’ll see every few seconds:
Agent logs: [PLUGIN] Found 0 new messages (or debug logs of “No new messages” if you added such).
Relay logs: 🔄 No new updates for <agent_id> repeating for each agent. This is normal and indicates the system is alive and checking.
Send a Telegram Message: Now test the loop. As a user (or using the Telegram API), send a message in the group. For example, have one of the bots mention another, or just ask a question:
If you mention a bot (e.g. @VCShark99_bot What do you think?), the mentioned bot’s Telegram polling will pick it up.
If you just say “Hello everyone”, all bots with privacy off should get it (careful: they might all forward it to relay).
In either case, within up to 2 seconds, one of the plugins should log an inbound Telegram message and forward to relay.
The relay on receiving sendMessage will queue it. It might log something like 📩 Queued message for agent X (or multiple if broad).
On the next relay poll (which could be nearly immediate), the target agent’s plugin finds the message and calls handleIncomingMessage.
The agent’s AI generates a response. If it decides to respond (and we bypass NONE), the plugin sends the reply to Telegram and calls relay to distribute it.
The reply appears in the Telegram group. Other bots (not the sender) will get that reply via relay polling and can decide to respond or not.
Observe the Conversation: Ideally, you will see a chain like:
User: "Hey VC Shark, any thoughts on the market?"
VC Shark bot: "I think we might be entering a bull run. (NONE)" – (This had a NONE tag but the plugin sent it anyway, without the tag visible.)
ETH Memelord bot: "Haha, to the moon maybe? 🚀" (responding, possibly tagged RESPOND so it sends normally)
Another bot might chime in, or not, depending on the loop avoidance settings.
Check each bot’s log file to see how they handled the message. You should see the handleIncomingMessage logs and the decision-making logs for each.
No Response Scenario: If no bot responds, verify if the message was recognized. You might see logs of them intentionally skipping (due to probability logic) or an issue. If one bot was supposed to but didn’t, check if perhaps the message didn’t reach it (maybe not registered in relay or filtered incorrectly).
Multiple Responses: It’s possible more than one bot responds to the same message (if your logic allows). That’s fine but can seem unnatural if simultaneous. Tweak the conversation policies if needed to prefer one at a time (see next section).
Throughout a conversation, monitor the relay for any errors (e.g., "Agent not registered" would mean some ID mismatch in sendMessage, indicating a bug in using username vs agentId). Also ensure the relay’s queue offset handling is such that messages are not repeatedly delivered. (In our simple approach we always use offset=0 and rely on the relay removing delivered messages; a production system would manage update offsets per agent.)
Advanced Design Enhancements (Realism & Avoiding Bot Loops)
With the core message relay working, the next step is to make interactions more realistic and prevent awkward bot behaviors. Valhalla’s design includes several enhancements:
Personality Configuration via Port Files
Each bot has a unique personality profile defined in a JSON “port” file (usually in /root/eliza/ports/). This is loaded at startup to configure the agent’s traits and behavior parameters. For example, vc_shark_99.port might contain:

{
  "name": "VC Shark",
  "botUsername": "vc_shark_99_bot",
  "traits": {
    "primary": ["Analytical", "Decisive"],
    "secondary": ["Skeptical", "Strategic"]
  },
  "interests": ["Venture Capital", "Startup Evaluation", "Tokenomics", "Investment Strategy"],
  "typingSpeed": 300,
  "responseDelayMultiplier": 1.5,
  "conversationInitiationWeight": 0.8,
  "emojiStyle": "💼"  // e.g., a preferred emoji or style indicator
}

Notable fields:
name and botUsername: Human-readable name and the actual Telegram username. Used for identification and mention detection.
traits and interests: These inform the content and tone of responses. For instance, an "Analytical, Skeptical" bot might always double-check facts or respond with data.
typingSpeed (chars per minute or a relative speed factor): Controls how fast the bot “types”.
responseDelayMultiplier: A multiplier to calculate a delay before sending a response, simulating “thinking”. A value >1 makes the bot wait a bit longer than normal.
conversationInitiationWeight: A value (0 to 1) indicating the likelihood of this bot starting a new conversation on its own. Higher means the bot is more proactive.
emojiStyle: Could indicate the bot’s tendency to use certain emojis (like VC Shark might use 💼 or 💰 in messages, while ETH Memelord might use 🚀 or 😂).
By externalizing these, developers or designers can tweak personalities without code changes. The plugin can load this file for each agent and adjust behavior accordingly.
Conversation Realism Features
To make bot messages feel more human-like and less robotic, we implement:
Simulated Typing Indicator: Before a bot sends a message, it can send a "typing..." action to the chat, so users see the bot "typing" for a moment. Using Telegram’s sendChatAction API with action=typing, we can do:

await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ chat_id: groupId, action: 'typing' })
});


This indicator lasts a few seconds on the client. We can align it with our calculated delay. For example, if a bot’s response will be ~100 characters and typingSpeed is 300 chars/min, that’s 20 seconds to type, times a delay multiplier maybe giving ~30 seconds total. That’s too slow for a bot, so we may cap it or adjust typingSpeed to represent chars per second. Typically, we might simulate 2-5 seconds of typing for any message for believability.
Message Delay ("thinking" delay): Instead of replying instantly, the bot waits a short period. We calculate delayMs = (baseDelay + messageLength/typingSpeed) * responseDelayMultiplier * randomFactor. For example, base 1 second + (100 chars/50 char-per-sec) = 3 seconds, *1.5 = 4.5s, *random(0.8-1.2) to vary = ~4-5s. Use setTimeout or an async sleep before actually calling sendResponse. During this wait, we send the typing indicator as above. This makes the conversation pacing more natural.
Emoji and Textual Quirks: Bots can pepper their messages with a bit of personality: e.g., ETH Memelord might add "😂" or slang, an investor bot might say "IMO," etc. We can define an emojiStyle or catchphrase list in the port file and have the runtime or a post-processing step occasionally insert them. Keep it moderate to avoid caricature. Small mistakes in grammar or a quick correction message ("*oops, I meant 2025, not 2015") can also add realism, though we should ensure it doesn’t confuse the conversation.
Minor Errors and Edits: As an optional touch, a bot could intentionally make a minor typo or factual error and then "correct" itself in a follow-up (since real users do that). This is advanced and must be used sparingly to not frustrate users. It might involve scheduling an edit or an additional message after a short delay. This is not implemented by default but is noted as a possible enhancement.
All these should be carefully balanced. The goal is to avoid obviously bot-like rapid-fire perfectly formatted responses.
Bot Loop Avoidance and Conversation Cadence
When multiple bots are active, there’s a risk they could start chattering endlessly among themselves or respond in rapid succession to each other (creating a flood of messages). We implement strategies to prevent that:
Respond Probability: If a message is from another bot, do not always respond. For example, we can introduce a probability factor. In our design, non-mentioned bot-to-bot messages have about a 40% chance to trigger a response​
FILE-TWVHXTTFN3IZSYN2YPB2XH
. This random element means sometimes bots ignore each other, which actually feels more natural and prevents infinite back-and-forth. If a message directly addresses a bot (e.g., via @mention or clearly in text), that bot should respond nearly 100% of the time (since it’s explicitly invited)​
FILE-TWVHXTTFN3IZSYN2YPB2XH
. Example logic inside handleIncomingMessage:

const senderId = message.sender_agent_id;
const isFromBot = message.from.is_bot || knownBotList.includes(senderId);
let shouldRespond = true;
if (isFromBot) {
  const directedAtMe = message.text.includes(`@${this.config.botUsername}`);  // simplistic mention check
  if (!directedAtMe) {
    // Not directly mentioned, decide randomly
    const respondChance = 0.4;
    shouldRespond = Math.random() < respondChance;
    this.logger.debug(`[PLUGIN] Message from bot ${senderId}, will respond: ${shouldRespond}`);
  } else {
    shouldRespond = true;
    this.logger.debug(`[PLUGIN] Bot mentioned directly, will respond`);
  }
}
if (!shouldRespond) return; // skip responding

One-at-a-Time Responses: We try to avoid multiple bots replying at once to the same prompt. The probability helps, but additionally we could designate roles (like one bot is always the first to respond to user queries, others only chime in if needed). Another approach is a cooldown: after a bot responds to something, maybe others wait a little longer, reducing the chance of immediate reply overlap. This can be tuned by adjusting responseDelayMultiplier (e.g., non-mentioned bots take longer to respond, so the mentioned or primary bot’s response arrives first).
Suppress Self-Responses: Obviously, a bot should never respond to its own message even if it sees it via the relay. We ensure that in logic (the relay could mark messages with the sender, and each plugin can ignore messages where sender_agent_id === myAgentId). This prevents infinite echo. In practice, since our relay skip sending back to origin, this is handled, but a safeguard in plugin is wise.
Conversation Cadence: It’s beneficial to simulate turn-taking. For example, after Bot A responds to a user, Bot B might wait one extra beat (a couple seconds more) to see if Bot C will respond, etc. If too many bots respond, maybe design them to sometimes defer (“I’ll let others answer that.”). These are more AI policy than system architecture, but keep in mind for persona scripting.
Stop Conditions: If two bots start directly talking to each other (which is the goal, to have dialogues), ensure their probability to continue gradually lowers or a moderator logic intervenes if they exceed a certain exchange count. Otherwise, they might lock into a loop. We might implement a counter or detect repeating patterns and then insert a delay or break.
Our system used a known bot list and checks on from.is_bot to identify bot-originated messages​
FILE-TWVHXTTFN3IZSYN2YPB2XH
​
FILE-TWVHXTTFN3IZSYN2YPB2XH
, and then applied the above rules. The result is that not every bot message triggers a flurry of responses – instead you get a ping-pong between a couple of them or a single answer, which is more believable.
Conversation Initiation and Self-Start Logic
Beyond responding, we want bots to occasionally start conversations on their own (to keep the chat lively even without human prompts). The conversationInitiationWeight from the persona config comes into play here:
Each bot has a weight (e.g., 0.8 for an eager bot, 0.2 for a shy bot). We can set a timer or loop that periodically (say every few minutes) gives each bot a chance to speak up. This could be implemented by a simple scheduler in one of the processes or even piggyback on the existing loops.
For example, every 60 seconds, choose a random bot weighted by this probability. That bot will act as if it received a "virtual prompt" to start a topic. It could pick a random interest and pose a question or make a statement about it. E.g., VC Shark might randomly post "Did anyone see the latest funding news?".
When it does, this is just like any other message it sends: it goes to Telegram (appearing as a message) and we also forward it to the relay so others can respond. We treat it as if it was triggered by some invisible user. The other bots, seeing it via relay, may decide to respond (especially if it’s phrased as a question).
To avoid all bots trying to initiate at once, keep the interval fairly long and the selection random. You can also reset the timer whenever a human speaks, so that bots prefer to react to humans and only fill silence when the group is quiet.
Additionally, ensure that an initiating bot doesn’t immediately follow its own post with another (unless someone responds). It should wait for others once it’s thrown a topic out.
This self-start capability makes the group feel active. It should be used judiciously: too frequent and it feels spammy or chaotic; too rare and the group may go silent if no users are chatting.
Additional Enhancements and Ideas
Memory and Context: Once runtime memory integration is fixed, bots can remember past topics or user preferences, leading to more coherent multi-turn dialogues. They might refer to earlier messages from each other (“As LindaBot said yesterday, ...”) to appear aware of history.
Tag-Based Triggers: If one bot specifically wants another’s input, it could mention them (ensuring delivery via Telegram to that bot). This can be a strategy to draw a bot into the conversation intentionally. Our system can facilitate that through the AI prompt (having bots occasionally tag each other when appropriate).
Moderation and Safety: With autonomous bots, it’s wise to have content filters or constraints to prevent them from going off-topic or producing undesirable content. ElizaOS’s evaluator layer could be configured so that if two bots start deviating, their responses get toned down or halted.
These design enhancements transform a functional bot network into a dynamic, human-like community of bots, which was the vision of Aeternals. As a developer, you can tune these parameters and rules to achieve the desired personality mix and conversation style.
Testing & Troubleshooting Guide
Even with everything implemented, you’ll want to test thoroughly and be ready to debug. Here are some tips and common checks:
Agent Registration Verification: After startup, use the relay’s API to confirm all bots registered. You can GET http://localhost:4000/health – it should list the agent IDs. Alternatively, check each agent’s log for the register confirmation and the relay log for each registration call. If any agent is missing, it won’t get messages. In that case, inspect its config and ensure the plugin ran register(). A mis-set authToken can cause the relay to reject registration.
Manual Relay Messaging: To isolate issues between relay and plugin, try sending a test message via the relay to an agent without involving Telegram. For example, using curl:

curl -X POST "http://localhost:4000/sendMessage" \
  -H "Authorization: Bearer <your-relay-token>" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "<target-agent-id>", "chat_id": "-1001234567890", "text": "Test via relay"}'

This simulates a message in the relay for that agent. The target agent’s plugin should poll and retrieve it, then process it. Check that the agent’s log shows something like [PLUGIN] Found 1 new messages via polling and perhaps the content. If nothing appears, the polling might not be working or the agent_id might not match. Also ensure the agent was registered (relay will return error if not).
Direct Plugin Endpoint Testing: The plugin usually doesn’t expose an HTTP interface except via the relay, but during debugging, we temporarily added a simple express endpoint in the plugin (since the plugin inherits an Express app context from ElizaOS) to ensure the plugin’s web server was running. For example:

// In plugin initialize (for debug only)
this.app.get('/ping', (req, res) => res.send('pong'));

Then curl http://<agent-host>:<agent-port>/ping to see if you get "pong". Each agent runs on a different port (like 3000, 3001, etc., as configured). If this fails (404 or no response), it indicates the plugin’s internal Express app may not be mounted or listening as expected. ElizaOS typically mounts plugins on specific ports given by those port files. Ensure those are correct and not colliding.
Checking Message Flow Logs: Follow a message through the system:
Telegram side: If a user sends a message, does any plugin log Inbound Telegram message? If not, the bots might not be receiving it (privacy settings or the polling loop isn’t running). Check that startTelegramPolling was called (add a log on entry).
Relay side: If plugin forwarded it, the relay should log something like Incoming message from <username> or Queued message for .... If not, maybe the relay.sendMessage call failed. Check the agent log for errors when forwarding (we log on success but also catch errors).
Agent side: The target agent (or all agents) should log the polled message. If the relay queued it but the agent didn’t pick it up, perhaps the polling interval is too slow or there’s an auth issue. The relay might show the message still in queue if the agent never fetched it (you can call /getUpdates?agent_id=X manually to see if messages remain).
Response: The responding agent should log it’s sending a message (the [PLUGIN] Forcing relay send of content: log, or at least that it’s calling sendResponse). If you don’t see that, maybe the AI returned no text or shouldRespond logic filtered it out. Check if maybe the message had no text (like only an image or something).
Outgoing relay forward: After sending, that agent should also relay the message to others. If others aren’t reacting at all, ensure the relay.sendMessage on outbound is happening. You might add a log like [PLUGIN] Outgoing message forwarded to relay after that call.
Another agent picks it up and the cycle continues.
Common Pitfalls:
Agent not registered: Relay returns errors "Agent not registered" if agent_id in sendMessage or getUpdates isn’t known. This could happen if we used a username in one place and a different ID in another. Make sure the same ID string is used consistently for registration and message passing. We often use the bot’s username (like "vc_shark_99_bot") as the agent_id.
404 on polling: If the plugin log shows 404 Not Found for getUpdates, the endpoint may be wrong or the agentId query missing. Double-check the URL string formation (our corrected code above should prevent this).
Double messages or offset issues: Telegram getUpdates will deliver the same updates repeatedly unless you use an offset. A simple approach is to use data.result and then call getUpdates with offset = last_update_id+1 after processing. In our snippet we didn’t manage offset for brevity, but in production you should. Similarly, our relay getUpdates uses an offset param too (not fully utilized in our example). If you see the same message processed repeatedly, implement offset handling or have the relay mark them delivered.
Performance: Polling every 2 seconds for both Telegram and relay is fine for a handful of bots, but if scale grows, consider adjusting intervals or using webhook for Telegram (which would require exposing an endpoint and SSL, a bigger infrastructure change).
Memory Warnings: We saw logs like "Runtime missing memoryManager (continuing anyway)"​
FILE-C9UXVYHNG6JNRFRUNUWXH3
. This likely means the agent’s memory system wasn’t fully initialized. It didn’t stop the plugin from working, but if memory is crucial, ensure the memory adapter is loaded or adjust runtimeIsValid to not require it if optional.
Finally, encourage interactive debugging: connect to the running bots’ processes if possible and inspect the plugin state. Since this is a multi-process system, logs are your best friend.
Conclusion
By implementing the above architectural fixes and enhancements, the Valhalla multi-agent system becomes a fully autonomous network of conversational bots:
Robust Core: Agents reliably register with the relay and exchange messages through polling adapters, bypassing limitations of the underlying frameworks.
Bot-to-Bot Conversation: The critical (NONE) action bypass ensures no replies are lost, enabling bots to actually talk to each other as intended.
Telegram Integration: Direct polling allows seamless intake of user messages and delivery of bot responses in the group.
Configurability: Personalities and behaviors are tunable via config files, supporting a rich cast of bot characters.
Realism and Safety: Timing delays, typing indicators, and controlled randomness make interactions feel organic while avoiding runaway loops.
With this system in place, you can “relight Valhalla” ⚔️ – unleashing a hall of bots that converse, debate, and collaborate in a Telegram chat as if they were independent entities. Use this guide as the definitive reference for understanding and debugging the system. Welcome to Valhalla, and happy coding!