"use client";

import { useState } from "react";
import { directionsUrl, type NormalizedLocation } from "@/lib/maps";

export function GetDirections({ destination }: { destination: NormalizedLocation }) {
  const [message, setMessage] = useState("");
  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("Location is unavailable in this browser. Use Get Directions to open the destination.");
      return;
    }
    setMessage("Requesting your location permission…");
    navigator.geolocation.getCurrentPosition(
      position => window.location.assign(directionsUrl(destination, { latitude: position.coords.latitude, longitude: position.coords.longitude })),
      error => setMessage(error.code === 1 ? "Location permission was denied. You can still open directions to the destination." : "Your current location could not be read. You can still open directions to the destination."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }
  return <><button type="button" onClick={useCurrentLocation} className="button-secondary min-h-11">Route from my location</button>{message&&<span role="status" className="basis-full text-xs text-muted">{message}</span>}</>;
}
