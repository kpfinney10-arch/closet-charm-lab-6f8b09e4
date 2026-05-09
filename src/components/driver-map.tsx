import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type DriverPin = {
  user_id: string;
  name: string;
  on_duty: boolean;
  lat: number;
  lng: number;
  updated_at: string;
  speed?: number | null;
  accuracy?: number | null;
  cases?: {
    id: string;
    case_number: string;
    status: string;
    decedent: string;
    route: string;
  }[];
};

function makeIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:18px;height:18px;border-radius:9999px;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.25)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

const ON_DUTY_ICON = makeIcon("hsl(142 71% 45%)");
const OFF_DUTY_ICON = makeIcon("hsl(215 16% 47%)");

function FitToPins({ pins }: { pins: DriverPin[] }) {
  const map = useMap();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || pins.length === 0) return;
    const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.2), { animate: false });
    fittedRef.current = true;
  }, [pins, map]);
  return null;
}

export function DriverMap({ pins }: { pins: DriverPin[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const center = useMemo<[number, number]>(() => {
    if (pins.length > 0) return [pins[0].lat, pins[0].lng];
    return [39.5, -98.35]; // US fallback
  }, [pins]);

  if (!mounted) {
    return <div className="h-full w-full bg-muted" aria-hidden />;
  }

  return (
    <MapContainer
      center={center}
      zoom={pins.length > 0 ? 10 : 4}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToPins pins={pins} />
      {pins.map((p) => (
        <Marker
          key={p.user_id}
          position={[p.lat, p.lng]}
          icon={p.on_duty ? ON_DUTY_ICON : OFF_DUTY_ICON}
        >
          <Popup>
            <div className="space-y-0.5">
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs">{p.on_duty ? "On duty" : "Off duty"}</div>
              <div className="text-xs text-muted-foreground">
                Updated {new Date(p.updated_at).toLocaleTimeString()}
              </div>
              {typeof p.speed === "number" && (
                <div className="text-xs">Speed: {Math.round(p.speed * 2.237)} mph</div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
