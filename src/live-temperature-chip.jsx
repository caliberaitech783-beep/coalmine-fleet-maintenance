import React, {useEffect, useState} from "react";
import {Thermometer} from "lucide-react";
import {fetchLiveTemperature, formatTemperature, resolveTemperatureCoordinates, TEMPERATURE_REFRESH_MS} from "./live-temperature.mjs";
import "./live-temperature-chip.css";

/** Live outdoor temperature (viewer position, else the assigned site) while `active`; refreshed every 10 minutes. */
export function useLiveTemperature(site, active = true) {
  const [reading, setReading] = useState({celsius: null, place: "", error: false});
  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    const controller = new AbortController();
    const load = async () => {
      try {
        const coordinates = await resolveTemperatureCoordinates(site);
        const result = await fetchLiveTemperature({...coordinates, signal: controller.signal});
        if (!stopped) setReading({celsius: result.celsius, place: coordinates.place, error: false});
      } catch {
        if (!stopped) setReading((current) => ({...current, error: true}));
      }
    };
    void load();
    const timer = setInterval(load, TEMPERATURE_REFRESH_MS);
    return () => { stopped = true; controller.abort(); clearInterval(timer); };
  }, [site, active]);
  return reading;
}

export function temperatureChipTitle(reading) {
  if (reading.error) return "Outside temperature unavailable";
  return `Outside temperature${reading.place ? ` at ${reading.place}` : ""}, refreshed every 10 minutes`;
}

/** Header chip: "(37°C) 98.6°F" with a live dot, for Admin, Super Admin and Manager headers. */
export default function LiveTemperatureChip({location = "", className = ""}) {
  const reading = useLiveTemperature(location, true);
  const state = reading.error ? " is-error" : Number.isFinite(reading.celsius) ? "" : " is-loading";
  return <span className={`live-temperature-chip${state} ${className}`.trim()} role="status" aria-live="polite" title={temperatureChipTitle(reading)}>
    <Thermometer aria-hidden="true" />
    <b>{formatTemperature(reading.celsius)}</b>
  </span>;
}
