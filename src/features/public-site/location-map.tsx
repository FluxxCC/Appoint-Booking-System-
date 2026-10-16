"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";

export type MapPoint = { latitude: number; longitude: number };

export default function LocationMap({ point, onChange = () => {}, interactive = true }: { point: MapPoint | null; onChange?: (point: MapPoint) => void; interactive?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const marker = useRef<Leaflet.Marker | null>(null);
  const pointRef = useRef(point);
  const changeRef = useRef(onChange);
  const hasPoint = point !== null;

  useEffect(() => {
    pointRef.current = point;
    changeRef.current = onChange;
  }, [point, onChange]);

  useEffect(() => {
    let alive = true;
    let dispose: (() => void) | undefined;
    void import("leaflet").then((L) => {
      if (!alive || !element.current) return;
      const initial = pointRef.current;
      if (!initial) return;
      const leafletMap = L.map(element.current, { center: [initial.latitude, initial.longitude], zoom: 16, scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        referrerPolicy: "origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(leafletMap);
      const pinIcon = L.divIcon({ className: "home-service-map-pin", html: '<span class="home-service-map-pin-core"></span>', iconSize: [28, 36], iconAnchor: [14, 34] });
      const setPin = (next: MapPoint, zoom = 16) => {
        const latLng: Leaflet.LatLngExpression = [next.latitude, next.longitude];
        if (!marker.current) {
          marker.current = L.marker(latLng, { draggable: interactive, icon: pinIcon, title: "Selected service location" }).addTo(leafletMap);
          if (interactive) marker.current.on("dragend", () => {
            const position = marker.current?.getLatLng();
            if (position) changeRef.current({ latitude: position.lat, longitude: position.lng });
          });
        } else marker.current.setLatLng(latLng);
        leafletMap.setView(latLng, Math.max(leafletMap.getZoom(), zoom));
      };
      if (interactive) leafletMap.on("click", (event: Leaflet.LeafletMouseEvent) => {
        const next = { latitude: event.latlng.lat, longitude: event.latlng.lng };
        setPin(next);
        changeRef.current(next);
      });
      map.current = leafletMap;
      if (initial) setPin(initial, 16);
      const resize = window.setTimeout(() => leafletMap.invalidateSize(), 50);
      dispose = () => { window.clearTimeout(resize); leafletMap.remove(); map.current = null; marker.current = null; };
    });
    return () => { alive = false; dispose?.(); };
  }, [interactive, hasPoint]);

  useEffect(() => {
    if (!map.current || !point) return;
    void import("leaflet").then((L) => {
      if (!map.current) return;
      const position: Leaflet.LatLngExpression = [point.latitude, point.longitude];
      if (marker.current) marker.current.setLatLng(position);
      else {
        const pinIcon = L.divIcon({ className: "home-service-map-pin", html: '<span class="home-service-map-pin-core"></span>', iconSize: [28, 36], iconAnchor: [14, 34] });
        marker.current = L.marker(position, { draggable: interactive, icon: pinIcon, title: "Selected service location" }).addTo(map.current);
        if (interactive) marker.current.on("dragend", () => {
          const current = marker.current?.getLatLng();
          if (current) changeRef.current({ latitude: current.lat, longitude: current.lng });
        });
      }
      map.current.setView(position, Math.max(map.current.getZoom(), 16));
    });
  }, [point, interactive]);

  return <div ref={element} role="region" className={`w-full overflow-hidden rounded-xl ${hasPoint ? "h-64 bg-canvas sm:h-72" : "flex h-40 items-center justify-center bg-canvas px-6 text-center"}`} aria-label={interactive ? "Interactive service location map" : "Appointment destination map"}>
    {!hasPoint&&<p className="max-w-sm text-sm leading-6 text-muted">Share your current location or search for an address to place your pin on the map.</p>}
  </div>;
}
