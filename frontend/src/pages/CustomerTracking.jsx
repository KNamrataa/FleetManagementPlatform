import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, RefreshCw, Radio, WifiOff } from "lucide-react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { useParams } from "react-router-dom";
import { apiRequest } from "../services/api";
import { getSocket } from "../services/socket";
import CustomerLayout from "./CustomerLayout";
import "./CustomerDashboard.css";

const badge=(s="")=>s.toLowerCase().replaceAll("_","-");
const date=v=>v?new Date(v).toLocaleString():"—";
const markerIcon = L.divIcon({
  className: "customer-live-marker",
  html: '<div class="customer-live-marker-dot"><span></span></div>',
  iconSize: [34,34], iconAnchor: [17,17], popupAnchor: [0,-18]
});
function Recenter({position}){const map=useMap();useEffect(()=>{if(position)map.setView(position,map.getZoom(),{animate:true})},[map,position]);return null}

export default function CustomerTracking(){
  const {id}=useParams();
  const [trips,setTrips]=useState([]),[selected,setSelected]=useState(id||""),[data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[connected,setConnected]=useState(false),[tick,setTick]=useState(Date.now());
  const loadTrips=useCallback(async()=>{try{const [r,p]=await Promise.all([apiRequest("/api/customer/trips?status=IN_PROGRESS"),apiRequest("/api/customer/trips?status=PAUSED")]);const all=[...(r.trips||[]),...(p.trips||[])];setTrips(all);if(!selected&&all[0])setSelected(all[0]._id)}catch(e){setError(e.message)}},[selected]);
  const load=useCallback(async()=>{if(!selected)return;setLoading(true);setError("");try{setData(await apiRequest(`/api/customer/trips/${selected}/tracking`))}catch(e){setError(e.message)}finally{setLoading(false)}},[selected]);
  useEffect(()=>{loadTrips()},[loadTrips]);
  useEffect(()=>{if(selected)load()},[selected,load]);
  useEffect(()=>{const t=setInterval(()=>setTick(Date.now()),5000);return()=>clearInterval(t)},[]);
  useEffect(()=>{if(!selected)return;const socket=getSocket();const onConnect=()=>setConnected(true);const onDisconnect=()=>setConnected(false);const onGps=tracking=>{if(String(tracking.trip)===String(selected)){setData(prev=>({...prev,available:true,tracking}));setTick(Date.now())}};socket.on("connect",onConnect);socket.on("disconnect",onDisconnect);socket.on("trip:gps",onGps);socket.emit("trip:subscribe",{tripId:selected},ack=>{if(!ack?.success)setError(ack?.message||"Unable to subscribe to live tracking.")});setConnected(socket.connected);return()=>{socket.emit("trip:unsubscribe",{tripId:selected});socket.off("connect",onConnect);socket.off("disconnect",onDisconnect);socket.off("trip:gps",onGps)}},[selected]);
  const tracking=data?.tracking;
  const position=useMemo(()=>tracking?.latitude!=null&&tracking?.longitude!=null?[Number(tracking.latitude),Number(tracking.longitude)]:null,[tracking]);
  const age=tracking?.recordedAt?Math.max(0,Math.round((tick-new Date(tracking.recordedAt).getTime())/1000)):null;
  const stale=age!=null&&age>60;
  return <CustomerLayout title="Live Tracking" subtitle="Real-time location of your active trip">
    <div className="customer-toolbar"><div><h2>Live Tracking</h2><p>GPS updates are pushed live from the assigned driver/device.</p></div><div className="customer-actions-inline"><span className={`customer-live-connection ${connected?"online":"offline"}`}>{connected?<Radio size={15}/>:<WifiOff size={15}/>} {connected?"Live connection":"Reconnecting"}</span><button className="customer-button" onClick={load} disabled={loading}><RefreshCw size={16}/> Refresh</button></div></div>
    {error&&<div className="customer-alert error">{error}</div>}
    <section className="customer-card"><label style={{display:"flex",flexDirection:"column",gap:6,color:"#5d708d",fontSize:12,fontWeight:700,maxWidth:620}}>Active Trip<select className="customer-button" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select active trip</option>{trips.map(t=><option key={t._id} value={t._id}>{t.tripId} — {t.pickupLocation} → {t.destination}</option>)}</select></label></section>
    {selected&&<section className="customer-track-box">{loading&&!data?<div className="customer-loading"><div className="customer-loading-inner"><div className="customer-spinner"/>Loading tracking...</div></div>:data?.available?<>
      {position?<div className="customer-real-map"><MapContainer center={position} zoom={15} scrollWheelZoom style={{height:"100%",width:"100%"}}><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Marker position={position} icon={markerIcon}><Popup><strong>{data.trip?.vehicle?.registrationNumber||"Vehicle"}</strong><br/>{data.trip?.driver?.fullName||"Driver"}<br/>{Number(tracking?.speed||0).toFixed(1)} km/h</Popup></Marker><Recenter position={position}/></MapContainer>{stale&&<div className="customer-map-stale">GPS signal stale — last update {age}s ago</div>}</div>:<div className="customer-map-placeholder"><div><MapPin size={38}/><strong>Waiting for first GPS update</strong><div className="customer-note">The map appears as soon as the assigned driver/device reports coordinates.</div></div></div>}
      <div className="customer-detail-grid">{[["Vehicle",data.trip?.vehicle?.registrationNumber||tracking?.vehicle?.registrationNumber||"—"],["Driver",data.trip?.driver?.fullName||tracking?.driver?.fullName||"—"],["Trip Status",<span className={`customer-badge ${badge(data.trip?.tripStatus)}`}>{data.trip?.tripStatus?.replaceAll("_"," ")}</span>],["GPS Status",stale?"STALE":"LIVE"],["Speed",`${Number(tracking?.speed||0).toFixed(1)} km/h`],["Distance Travelled",`${Number(tracking?.distanceTravelled||0).toFixed(2)} km`],["Remaining Distance",`${Number(tracking?.remainingDistance||0).toFixed(2)} km`],["Estimated Arrival",date(tracking?.estimatedArrival)],["Last Updated",date(tracking?.recordedAt)],["Coordinates",position?`${position[0].toFixed(6)}, ${position[1].toFixed(6)}`:"Not available"],["Source",tracking?.source||"—"]].map(([a,b])=><div className="customer-detail" key={a}><span>{a}</span><strong>{b}</strong></div>)}</div>
    </>:<div className="customer-empty">{data?.message||"Live tracking is available only for active trips."}</div>}</section>}
  </CustomerLayout>
}
