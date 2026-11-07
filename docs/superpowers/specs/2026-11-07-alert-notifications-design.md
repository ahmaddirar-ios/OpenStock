# Alerts that reach the trader — design

Status: **draft, awaiting approval** (2026-11-07)

## What the trader wants

"Save an alert and forget about it. When it fires, I know — while the page is open, while another
tab is open, and on my phone when nothing is."

TradingView's model, which is the bar here: a rule fires → a toast in the app, a sound, a browser
notification, and an entry in the alert log. The trader chooses which of those they want once, and
every rule follows.

## What we already have (discovered before designing)

- **Push already exists.** `components/alerts/PushToggle.tsx` asks for `Notification` permission,
  registers `public/sw.js`, and subscribes with a VAPID key; `lib/actions/push.actions.ts` reads push
  state and can send a test. So the phone channel is not new work — the design is about *wiring it
  to real firings* and about the in-page channel.
- **The log exists.** `MAX_ALERT_EVENTS = 200`, read by `AlertsCentre`.
- **The checker exists** twice: on page visit (`getUserAlerts`) and in the Inngest cron.
- **The toast library is installed** (`sonner`, already used by `PushToggle`).

## The design

### 1. A firing becomes an event on both sides

The checker already records a firing. Right after it records, it emits one event per firing
(`alertId`, `symbol`, `rule label`, `price`, `time`). Two consumers read that event:

- **In-page:** a small client component mounted in the app shell subscribes to the event stream and
  raises a `sonner` toast with the symbol, the rule and the price, plus a short chime (one
  `Audio` element, opt-out in settings; never autoplays before the trader has interacted — browsers
  block that and we honour it).
- **Push:** the Inngest cron sends a Web Push for every firing it writes, through the existing
  subscription rows, and prunes subscriptions the push service reports as gone (404/410).

### 2. The firing loop is honest about what is on screen

Today visiting the alerts page is what prices the rules. That stays — it is the demo's engine — but
it means a toast can appear while the trader is reading a chart they opened two hours ago. The loop
therefore runs at shell level, not inside the alerts page, so every page benefits; and it re-checks
on a 60-second timer only while the tab is visible.

### 3. One settings switch, one sound

`alerts.notify.inApp` (toast + sound) and `alerts.notify.sound` (sound only when in-app is on),
stored in the same browser storage the chart uses. Push stays where it is: the `PushToggle` on the
alerts page, since permission is a browser-level decision.

### 4. Where the code lives

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `lib/alert-events.ts` (new) | Pure: the firing → notification payload (title, body, cooldown key), so the copy and the de-dup rule are testable | nothing |
| `lib/actions/alert.actions.ts` (edit) | after writing events, fan out to push | existing alert repo, push actions |
| `lib/inngest/*` (edit) | the cron sends push per new firing | push actions |
| `components/alerts/AlertToaster.tsx` (new) | mounts in the shell, runs the visible-tab loop, raises toasts, plays the chime | alert events, sonner |
| `components/alerts/AlertsCentre.tsx` (edit) | the two switches | storage |

### 5. Failure modes, decided now

- **Same rule firing twice in a minute** (quote flap): the payload carries a cooldown key
  (`alertId + condition`), and the toaster drops a repeat inside `ALERT_COOLDOWN_SECONDS = 300`.
- **Push configured but no subscriptions**: silent no-op, not an error in the log.
- **Browser denied notifications**: the toggle already says `denied`; nothing else changes.
- **Cron missed a run**: the next run picks up every unfired rule — the checker is stateless per
  rule, so a missed minute only delays, never loses.
- **Alert deleted while its toast is queued**: the payload carries the symbol only; the toast is
  harmless.

### 6. Testing

Pure pieces (`alert-events`) by unit tests: payload copy in both languages, cooldown key, repeat
suppression, price formatting. The toaster gets a component test with a stubbed event source. Push
fan-out is tested by stubbing the send action and asserting one call per firing and the pruning of
gone subscriptions. Browser verification: fire a rule on localhost and see the toast + sound, then
the same on rovexjo.com.

## Out of scope

- Email digests (the audit mentions them; they need a policy on frequency and a template, and are a
  separate design).
- Server-push while the browser is closed without permission: impossible, the toggle is the gate.

## Open questions for approval

1. Sound on by default, or off until the trader turns it on? (Recommending **on**, once they have
   interacted with the page — which they always have by the time a rule exists.)
2. Toasts for **every** firing, or only firings that are not already in the open alerts page?
   (Recommending every firing, de-duplicated by the cooldown.)
