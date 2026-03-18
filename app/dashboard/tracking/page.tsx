'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import 'leaflet/dist/leaflet.css';

interface LocationPoint {
  id: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  recorded_at: string;
}

interface VoiceMemo {
  id: string;
  lat?: number;
  lng?: number;
  transcript?: string;
  duration_sec?: number;
  created_at: string;
  nas_path: string;
}

interface RouteData {
  date: string;
  locations: LocationPoint[];
  voiceMemos: VoiceMemo[];
  stats: {
    pointCount: number;
    totalDistanceKm: number;
    durationMin: number;
  };
}

export default function TrackingDashboardPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersLayerRef = useRef<any>(null);
  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  });

  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [selectedMemo, setSelectedMemo] = useState<VoiceMemo | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);

  const isToday = (() => {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return selectedDate === kst.toISOString().slice(0, 10);
  })();

  // Load route data
  const loadRoute = useCallback(async (date: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/tracking/location?date=${date}`);
      if (!res.ok) throw new Error('Failed to load route');
      const data: RouteData = await res.json();
      setRouteData(data);
      return data;
    } catch (e) {
      console.error('loadRoute error', e);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Draw route on map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawRoute = useCallback((L: any, map: any, data: RouteData) => {
    // Clear existing layers
    if (routeLayerRef.current) routeLayerRef.current.remove();
    if (markersLayerRef.current) markersLayerRef.current.remove();

    const layerGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = layerGroup;

    const points = data.locations;
    if (points.length === 0) return;

    // Draw polyline
    const latlngs = points.map((p: LocationPoint) => [p.lat, p.lng]);
    const poly = L.polyline(latlngs, {
      color: '#22d3ee',
      weight: 3,
      opacity: 0.85,
    }).addTo(layerGroup);
    routeLayerRef.current = poly;

    // Start marker (green)
    const startIcon = L.divIcon({
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 0 6px rgba(0,0,0,0.5)"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      className: '',
    });
    L.marker([points[0].lat, points[0].lng], { icon: startIcon })
      .addTo(layerGroup)
      .bindPopup('<b>시작</b><br>' + new Date(points[0].recorded_at).toLocaleTimeString('ko-KR'));

    // End marker (red)
    const endIcon = L.divIcon({
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 0 6px rgba(0,0,0,0.5)"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      className: '',
    });
    const last = points[points.length - 1];
    L.marker([last.lat, last.lng], { icon: endIcon })
      .addTo(layerGroup)
      .bindPopup('<b>종료</b><br>' + new Date(last.recorded_at).toLocaleTimeString('ko-KR'));

    // Voice memo markers
    data.voiceMemos.forEach((memo: VoiceMemo) => {
      if (memo.lat == null || memo.lng == null) return;
      const memoIcon = L.divIcon({
        html: '<div style="font-size:22px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6))">🎙</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        className: '',
      });
      const timeStr = new Date(memo.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      const durStr = memo.duration_sec ? ` · ${memo.duration_sec}초` : '';
      const transcript = memo.transcript
        ? `<div style="max-width:220px;font-size:12px;color:#ddd;margin-top:4px;white-space:pre-wrap">${memo.transcript.slice(0, 200)}</div>`
        : '<div style="font-size:11px;color:#888">변환 없음</div>';
      L.marker([memo.lat, memo.lng], { icon: memoIcon })
        .addTo(layerGroup)
        .bindPopup(`
          <div style="font-family:sans-serif;">
            <div style="font-weight:bold;color:#22d3ee">${timeStr}${durStr}</div>
            ${transcript}
          </div>
        `);
    });

    // Fit bounds
    map.fitBounds(poly.getBounds(), { padding: [40, 40] });
  }, []);

  // Init Leaflet map
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    import('leaflet').then(L => {
      // Fix leaflet icon issue in Next.js
      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current!, { zoomControl: true, attributionControl: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      // Default view (Seoul)
      map.setView([37.5665, 126.978], 12);

      leafletMapRef.current = map;
      leafletRef.current = L;
      setLeafletReady(true);
    });
  }, []);

  // Load and draw when leaflet ready or date changes
  useEffect(() => {
    if (!leafletReady) return;
    loadRoute(selectedDate).then(data => {
      if (data && leafletMapRef.current && leafletRef.current) {
        drawRoute(leafletRef.current, leafletMapRef.current, data);
      }
    });
  }, [leafletReady, selectedDate, loadRoute, drawRoute]);

  // Auto-refresh every 30 seconds when viewing today
  useEffect(() => {
    if (!isToday || !leafletReady) return;
    const id = setInterval(() => {
      loadRoute(selectedDate).then(data => {
        if (data && leafletMapRef.current && leafletRef.current) {
          drawRoute(leafletRef.current, leafletMapRef.current, data);
        }
      });
    }, 30000);
    return () => clearInterval(id);
  }, [isToday, leafletReady, selectedDate, loadRoute, drawRoute]);

  // Route replay animation
  const startReplay = useCallback(() => {
    if (!routeData || routeData.locations.length < 2 || !leafletRef.current || !leafletMapRef.current) return;
    setIsReplaying(true);

    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const points = routeData.locations;

    // Remove existing route
    if (routeLayerRef.current) routeLayerRef.current.remove();

    const replayPoly = L.polyline([], { color: '#f97316', weight: 3, opacity: 0.9 }).addTo(map);
    routeLayerRef.current = replayPoly;

    // Pulsing head marker
    const headIcon = L.divIcon({
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#f97316;border:3px solid white;box-shadow:0 0 8px #f97316"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      className: '',
    });
    const headMarker = L.marker([points[0].lat, points[0].lng], { icon: headIcon }).addTo(map);
    map.setView([points[0].lat, points[0].lng], 15);

    let idx = 0;
    replayTimerRef.current = setInterval(() => {
      if (idx >= points.length) {
        if (replayTimerRef.current) clearInterval(replayTimerRef.current);
        setIsReplaying(false);
        headMarker.remove();
        // Redraw full route
        drawRoute(L, map, routeData);
        return;
      }
      const p = points[idx];
      replayPoly.addLatLng([p.lat, p.lng]);
      headMarker.setLatLng([p.lat, p.lng]);
      map.panTo([p.lat, p.lng], { animate: true, duration: 0.3 });
      idx++;
    }, 80);
  }, [routeData, drawRoute]);

  const stopReplay = () => {
    if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    setIsReplaying(false);
    if (routeData && leafletRef.current && leafletMapRef.current) {
      drawRoute(leafletRef.current, leafletMapRef.current, routeData);
    }
  };

  const formatDuration = (min: number) => {
    if (min < 60) return `${min}분`;
    return `${Math.floor(min / 60)}시간 ${min % 60}분`;
  };

  const formatMemoTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-700/50 flex-shrink-0">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <span>📍</span> 위치 트래킹
        </h1>

        {/* Date selector */}
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />

        {/* Stats */}
        {routeData && (
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <span className="text-white/40">거리</span>
              <span className="font-bold text-cyan-400">{routeData.stats.totalDistanceKm}km</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="text-white/40">시간</span>
              <span className="font-bold text-green-400">{formatDuration(routeData.stats.durationMin)}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="text-white/40">포인트</span>
              <span className="font-bold text-white">{routeData.stats.pointCount}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="text-white/40">메모</span>
              <span className="font-bold text-yellow-400">{routeData.voiceMemos.length}</span>
            </span>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-white/50">
            <div className="w-3 h-3 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
            로딩 중...
          </div>
        )}

        {/* Replay button */}
        {routeData && routeData.locations.length >= 2 && (
          <button
            onClick={isReplaying ? stopReplay : startReplay}
            className={`ml-auto px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              isReplaying
                ? 'bg-orange-500/20 border border-orange-500 text-orange-400 hover:bg-orange-500/30'
                : 'bg-cyan-500/20 border border-cyan-500 text-cyan-400 hover:bg-cyan-500/30'
            }`}
          >
            {isReplaying ? '⏹ 정지' : '▶ 경로 재생'}
          </button>
        )}

        {isToday && (
          <div className="flex items-center gap-1 text-xs text-green-400">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            LIVE
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <div ref={mapRef} className="w-full h-full" />

          {/* Phone tracker URL instruction */}
          <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur rounded-xl px-4 py-3 text-xs max-w-xs z-[1000]">
            <div className="text-white/50 mb-1">📱 폰 트래커 URL</div>
            <div className="font-mono text-cyan-400 font-bold">loov.co.kr/tracker</div>
            <div className="text-white/30 mt-1">PIN: CCTV_PIN과 동일</div>
          </div>
        </div>

        {/* Right panel: voice memos */}
        <div className="w-72 flex-shrink-0 bg-slate-900 border-l border-slate-700/50 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50 flex-shrink-0">
            <div className="text-sm font-semibold text-white/80">🎙 음성 메모</div>
            <div className="text-xs text-white/30 mt-0.5">
              {routeData ? `${routeData.voiceMemos.length}개` : '로딩 중...'}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {routeData && routeData.voiceMemos.length === 0 && (
              <div className="px-4 py-8 text-center text-white/20 text-sm">
                이 날짜에 음성 메모가 없습니다
              </div>
            )}

            {routeData?.voiceMemos.map(memo => (
              <button
                key={memo.id}
                onClick={() => {
                  setSelectedMemo(selectedMemo?.id === memo.id ? null : memo);
                  // Pan map to memo location
                  if (memo.lat && memo.lng && leafletMapRef.current) {
                    leafletMapRef.current.setView([memo.lat, memo.lng], 16);
                  }
                }}
                className={`w-full text-left px-4 py-3 border-b border-slate-700/30 hover:bg-slate-800/50 transition-colors ${
                  selectedMemo?.id === memo.id ? 'bg-slate-800 border-l-2 border-l-cyan-500' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-cyan-400">{formatMemoTime(memo.created_at)}</span>
                  {memo.duration_sec && (
                    <span className="text-xs text-white/30">{memo.duration_sec}초</span>
                  )}
                </div>
                <div className={`text-xs text-white/60 leading-relaxed ${selectedMemo?.id === memo.id ? '' : 'line-clamp-2'}`}>
                  {memo.transcript || '(변환 없음)'}
                </div>
                {memo.lat && memo.lng && (
                  <div className="text-[10px] text-white/20 font-mono mt-1">
                    {memo.lat.toFixed(4)}, {memo.lng.toFixed(4)}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
