export type NormalizedLocation={latitude:number;longitude:number};

/** Map vendors are presentation adapters; appointments store normalized coordinates, not links. */
export function navigationUrl(location:NormalizedLocation,provider:"google"|"openstreetmap"="google"){
 const point=`${location.latitude},${location.longitude}`;
 return provider==="google"
  ?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`
  :`https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(location.latitude))}&mlon=${encodeURIComponent(String(location.longitude))}#map=17/${encodeURIComponent(String(location.latitude))}/${encodeURIComponent(String(location.longitude))}`;
}

export function directionsUrl(destination: NormalizedLocation, origin?: NormalizedLocation) {
 const params = new URLSearchParams({ api: "1", destination: `${destination.latitude},${destination.longitude}`, travelmode: "driving" });
 if (origin) params.set("origin", `${origin.latitude},${origin.longitude}`);
 return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** A provider-hosted map preview with a marker; no map credentials or location proxy are used. */
export function previewUrl(location:NormalizedLocation){
 const lat=location.latitude,lon=location.longitude,span=0.006;
 const south=Math.max(-90,lat-span),north=Math.min(90,lat+span);
 const west=Math.max(-180,lon-span),east=Math.min(180,lon+span);
 const query=new URLSearchParams({bbox:`${west},${south},${east},${north}`,layer:"mapnik",marker:`${lat},${lon}`});
 return `https://www.openstreetmap.org/export/embed.html?${query.toString()}`;
}
