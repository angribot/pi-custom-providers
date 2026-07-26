# Fast Mode state lives in the session branch

Toggling Fast Mode appends a custom session entry. Reading it back means finding the last such entry on the current branch, so the toggle follows branch structure: switching branches restores whatever Fast Mode was on that branch, and a resumed session comes back the way it was left.

An in-memory flag would have been smaller, but Fast Mode changes what a request costs. A user who switches to an older branch and sees the status bar from the branch they left would be billed at priority rates they didn't choose in that context.

`--fast` is therefore a *startup preference*, not a state assignment: it applies at most once per process, and only when nothing on the branch already says Fast Mode is on. Without that latch the flag would rewrite branch state on every `session_start` the host emits, and the branch history would stop being the source of truth.

The TUI status item is registered under one key and cleared on shutdown and whenever the selected model can't use Fast Mode, so a stale `⚡` never outlives the condition that produced it. Status writes happen only when the host reports `mode === "tui"`; in a non-TUI run the toggle still works and still persists, it just has nowhere to draw.

Consequence: session files carry Fast Mode entries, and the toggle is not shared across concurrent sessions on different branches. Both intended.
