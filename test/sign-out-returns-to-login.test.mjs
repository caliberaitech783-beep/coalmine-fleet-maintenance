import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const bell = main.slice(main.indexOf("function NotificationBell("), main.indexOf("function Normal("));
const app = main.slice(main.indexOf("function App()"));

// Signing out unmounts the whole signed-in tree, which runs every effect
// cleanup. A cleanup that throws (on 19-09-2026 the bell called `sound.close()`
// after the `sound` variable had been removed) makes React drop the entire
// application, so the user saw a blank white page instead of the sign-in form.

test("the notification bell's polling cleanup only aborts its own poll and timer", () => {
  const cleanup = bell.match(/return \(\) => \{ controller\.abort\(\); window\.clearTimeout\(timer\);([^}]*)\};/);
  assert.ok(cleanup, "the polling effect returns a cleanup that aborts the request and clears the retry timer");
  assert.equal(cleanup[1].trim(), "", `the cleanup must not call anything else, found: ${cleanup[1].trim()}`);
});

test("the notification bell never uses a bare `sound` object; the chime module owns the audio", () => {
  assert.doesNotMatch(bell, /(?<![\w.$])sound\s*[.(]/, "`sound` is not declared anywhere in NotificationBell");
  assert.doesNotMatch(main, /createNotificationSound/, "the per-mount sound object was replaced by playNotificationSound");
  assert.match(bell, /soundRef\.current = \{ play: \(\) => playNotificationSound\(bellSoundRef\.current\) \};/);
});

test("sign out clears the stored session and shows the sign-in screen in place", () => {
  assert.match(app, /logout = \(\) => \{\s*const token=session\?\.token\|\|authToken;\s*if\(token\)void fetch\('\/api\/logout'[^\n]*\n\s*clearStoredSession\(\);\s*setSession\(null\);\s*\}/);
  assert.match(app, /if \(!session\) return <Login onLogin=\{completeLogin\} theme=\{theme\} toggleTheme=\{toggleTheme\} \/>;/);
});
