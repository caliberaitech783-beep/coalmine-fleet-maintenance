import React, { useEffect, useState } from "react";

const clockFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
});

export default function VerificationTimeField() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    // Preview the database clock; the verify endpoint records its own NOW()
    // when saving, so neither this field nor the device clock sets the audit time.
    fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(({ databaseTime }) => {
        const epoch = Date.parse(databaseTime);
        if (controller.signal.aborted || !Number.isFinite(epoch)) return;
        const syncedAt = performance.now();
        const tick = () => setTime(clockFormat.format(new Date(epoch + performance.now() - syncedAt)));
        tick();
        timer = window.setInterval(tick, 1000);
      })
      .catch(() => {}); // Saving still records the system time if the preview is unavailable.
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  return <label className="full">Verification date &amp; time (IST)
    <input value={time} placeholder="Automatically recorded on verification" readOnly aria-readonly="true" />
    <small>System time · The exact time is recorded when you verify the request.</small>
  </label>;
}
