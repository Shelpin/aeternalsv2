TL;DR Summary
You are on the right track.

Dual polling is a real problem, and your instinct to focus on resolving the memory/OOM bug first is absolutely correct.

You should not introduce webhooks right now — resolving the core polling and memory logic inside the current plugin is the right strategy.

The provided scripts and implementation logic look sound, assuming the right parts of the plugin were patched accordingly.

The custom plugin is still polling, which explains the “silent but deadly” memory accumulation — that’s the root of the 137 errors.

✅ Key Analysis of Latest Inputs
📌 OOM Monster & TELEGRAM_OOM_COMPREHENSIVE_REPORT.md
Exit 137 (OOM) is caused primarily by:

TelegramMultiAgentPlugin polling + TelegramRelay polling = duplicate resource drain.

Unreleased AbortController, fetch memory leakage.

No GC (global.gc()) unless --expose-gc is used AND called manually.

Memory usage appeared "low" (~94MB) because Node’s RSS doesn’t include all memory mapped segments or fetch buffer allocations. Heap stats lie.

✅ Solution: Disabling polling from one side using DISABLE_POLLING=true completely solves the memory overgrowth.

📌 dual_polling.md & Your Hypothesis
Yes! You nailed it. Here’s the truth:

You must avoid having both the standard Telegram plugin and your custom plugin polling at the same time.

The reason you didn’t see 409 errors this time is likely:

Telegram standard plugin is not polling the actual Telegram API, but just bridging messages from the relay.

Your multiagent plugin polls the relay, not Telegram directly — so 409 conflict is avoided.

But memory overload still happens silently, because polling is duplicated and response buffers aren't cleared.

🧠 That’s worse in some ways than a 409: it fails invisibly and causes OOM crashes.

🔥 Final Strategy & Updated Action Plan (Valhalla Route v2)
🌄 STEP 1: Focus the War Effort
You are correct — fix OOM first, do not shift to webhooks or other architectural changes before system stability.

⚙️ STEP 2: Single Source of Polling Truth
✅ Keep polling logic only inside TelegramRelay (or only one place).

In TelegramMultiAgentPlugin, make sure this logic exists:

ts
Copy
Edit
if (process.env.DISABLE_POLLING === 'true') {
  this.logger.info('[RELAY][VALHALLA] Relay polling disabled by DISABLE_POLLING environment variable');
  return;
}
In your .env or launch scripts, set:

bash
Copy
Edit
DISABLE_POLLING=true
☑️ This ensures TelegramMultiAgentPlugin does not manage polling and avoids memory leaks.

🧠 STEP 3: Final Memory Fixes
Make sure you have these implemented:

--max-old-space-size=512

--expose-gc in NODE_OPTIONS

Explicit global.gc() after polling blocks (when FORCE_GC=true)

Cleanup of AbortController and fetch timeout handling

📦 STEP 4: Build & Launch Cleanly
Use the enhanced Valhalla launch script with:

Port cleanup

PID management

Staggered launches (avoid race conditions)

Logging

Make sure launch_valhalla.sh uses the updated environment:

bash
Copy
Edit
export DISABLE_POLLING=true
export FORCE_GC=true
export NODE_OPTIONS="--max-old-space-size=512 --expose-gc"
🔍 STEP 5: Validate in Stages
Start 1 agent: watch RSS and polling

Add a second agent after 60 sec: watch logs and memory

Start full set: confirm memory holds below ~200MB

Validate relay message handling, bot-to-bot flow, heartbeat

🧭 Final Thoughts
🔥 Yes — the new script and updated fixes are aligned with best practices.

✅ The system now has memory discipline.

🚫 Do not switch to webhooks yet — you've now got polling under control.

🧪 After stabilization, then you can explore async architectures like WebSockets.

📣 Message to Your Coding Buddy
“Mate, you’ve done an epic job fighting this beast. The memory leak was real — but we’ve isolated it. Run the final launch_valhalla.sh with DISABLE_POLLING=true, validate polling is handled in just one place, and confirm memory usage is stable. We’re walking through the golden gate now. Let’s reach Valhalla.”

Ready for the last march? Or need help double-checking your patch files before launch?







