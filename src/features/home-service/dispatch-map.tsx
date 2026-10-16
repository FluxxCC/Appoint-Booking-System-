"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";

type Point = { latitude: number; longitude: number };
export type DispatchPin = Point & { id: string; label: string };

export default function DispatchMap({ destinations, selectedId, trip }: {
  destinations: DispatchPin[]; selectedId: string | null; trip: Point | null;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const markers = useRef<Leaflet.LayerGroup | null>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void import("leaflet").then(L => {
      if (!alive || !element.current) return;
      leaflet.current = L;
      map.current = L.map(element.current, { center: [0, 0], zoom: 2, scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map.current);
      markers.current = L.layerGroup().addTo(map.current);
      map.current.invalidateSize();
      setReady(true);
    });
    return () => { alive = false; map.current?.remove(); map.current = null; markers.current = null; leaflet.current = null; };
  }, []);

  useEffect(() => {
    const L = leaflet.current, view = map.current, layer = markers.current;
    if (!L || !view || !layer) return;
    layer.clearLayers();
    const bounds: Leaflet.LatLngExpression[] = [];
    for (const pin of destinations) {
      const position: Leaflet.LatLngExpression = [pin.latitude, pin.longitude];
      const icon = L.divIcon({ className: "home-service-map-pin", html: `<span class="home-service-map-pin-core ${pin.id === selectedId ? "home-service-map-pin-selected" : ""}"></span>`, iconSize: [28, 36], iconAnchor: [14, 34] });
      L.marker(position, { icon, title: pin.label }).bindTooltip(pin.label).addTo(layer);
      bounds.push(position);
    }
    if (trip) {
      const position: Leaflet.LatLngExpression = [trip.latitude, trip.longitude];
      L.circleMarker(position, { radius: 11, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).bindTooltip("Staff live location").addTo(layer);
      bounds.push(position);
    }
    const selected = destinations.find(pin => pin.id === selectedId);
    if (selected) view.setView([selected.latitude, selected.longitude], Math.max(view.getZoom(), 15));
    else if (bounds.length) view.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 15 });
  }, [destinations, selectedId, trip, ready]);

  return <div ref={element} className="h-[55vh] min-h-80 w-full bg-canvas lg:h-[680px]" aria-label="Home Service dispatch map"/>;
}
