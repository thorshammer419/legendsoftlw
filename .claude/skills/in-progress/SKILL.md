---
name: in-progress
description: Start or resume a live session context document (in-progress.md) that auto-updates after every response. Invoke at the start of a working session so a fresh Claude can be brought up to speed instantly by reading the file.
---

Check whether `in-progress.md` exists in the current working directory.

**If it does not exist:**
Create `in-progress.md` populated from what you already know about this conversation. Use this exact structure:

```
# In Progress

## Current Task
<what is actively being worked on right now>

## Decisions Made
<key design and implementation choices locked in this session>

## Completed This Session
<work finished, in order>

## Pending / Next Steps
<remaining work, in priority order>

## Key Context
<constraints, relevant file paths, blockers, anything a fresh Claude needs to not step on a rake>

## Recent Exchanges
<a compressed but complete log of every exchange so far — user intent + assistant response summary, in order; nothing omitted>
```

Then tell the user: "Session tracking started. `in-progress.md` will be updated after every response. Delete the file when you're done with this feature."

**If it already exists:**
Read the existing file. Acknowledge what it captures — current task, what's done, what's pending. Do NOT wipe or reset it. Tell the user: "Resuming session tracking from existing `in-progress.md`." and briefly summarize the captured state so the user knows you're oriented.

The Stop hook will keep the file updated automatically after each response going forward.
