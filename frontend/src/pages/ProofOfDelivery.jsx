import { useCallback, useEffect, useState } from "react";
import { Camera, CheckCircle2, MapPin, RefreshCw, Upload, FileCheck2, ExternalLink } from "lucide-react";
import { apiRequest } from "../services/api";
import DriverLayout from "./DriverLayout";
import CustomerLayout from "./CustomerLayout";
import "./ProofOfDelivery.css";

const fmt = (v) => v ? new Date(v).toLocaleString("en-IN") : "—";
const statusLabel = (s) => String(s || "").replaceAll("_", " ");
const statusClass = (s) => String(s || "").toLowerCase().replaceAll("_", "-");

async function readImage(file) {
  if (!file || !file.type?.startsWith("image/")) throw new Error("Choose an image file.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Only JPG, PNG, and WEBP images are supported.");
  if (file.size > 800 * 1024) throw new Error("Each image must be 800 KB or smaller. Compress the image and try again.");
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.readAsDataURL(file);
  });
}

function PhotoInput({ label, value = [], onChange, otherPhotoCount = 0, multiple = true }) {
  const [error, setError] = useState("");
  const change = async (event) => {
    setError("");
    try {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;
      const available = 3 - otherPhotoCount - value.length;
      if (files.length > available) {
        throw new Error(`You can upload up to 3 photos total across arrival and delivery evidence. ${Math.max(0, available)} slot(s) remaining here.`);
      }
      const data = await Promise.all(files.map(async (file) => ({ data: await readImage(file), caption: file.name })));
      onChange([...value, ...data]);
      event.target.value = "";
    } catch (e) { setError(e.message); event.target.value = ""; }
  };
  const removePhoto = (index) => onChange(value.filter((_, i) => i !== index));
  return <div className="pod-upload"><label>{label}</label><div className="pod-file-control"><Upload size={17}/><input type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} onChange={change} disabled={value.length + otherPhotoCount >= 3}/></div><small>JPG, PNG or WEBP; up to 3 photos total across both groups, 800 KB each ({value.length + otherPhotoCount}/3 selected).</small>{error && <p className="pod-error">{error}</p>}{value?.length > 0 && <div className="pod-previews">{value.map((p,i)=><div className="pod-preview-item" key={`${p.caption || "photo"}-${i}`}><img src={p.data} alt={`${label} ${i+1}`}/><button type="button" className="pod-remove-photo" onClick={() => removePhoto(i)} aria-label={`Remove ${label} ${i+1}`}>Remove</button></div>)}</div>}</div>;
}

function EvidenceList({ proof }) {
  return <div className="pod-evidence">
    <div className="pod-meta-grid">
      <div><span>Delivery outcome</span><strong className={`pod-badge ${statusClass(proof.deliveryStatus)}`}>{statusLabel(proof.deliveryStatus)}</strong></div>
      <div><span>Recorded at</span><strong>{fmt(proof.deliveryTimestamp)}</strong></div>
      <div><span>Recipient</span><strong>{proof.recipientName || "—"}</strong></div>
      <div><span>GPS coordinates</span><strong>{proof.latitude != null && proof.longitude != null ? `${proof.latitude}, ${proof.longitude}` : "Not recorded"}</strong></div>
    </div>
    {proof.recipientConfirmation && <p><b>Recipient confirmation:</b> {proof.recipientConfirmation}</p>}
    {proof.failureReason && <p><b>Failure reason:</b> {proof.failureReason}</p>}
    {proof.partialDeliveryDetails && <p><b>Partial delivery details:</b> {proof.partialDeliveryDetails}</p>}
    {proof.notes && <p><b>Driver notes:</b> {proof.notes}</p>}
    {proof.latitude != null && proof.longitude != null && <a href={`https://www.google.com/maps?q=${proof.latitude},${proof.longitude}`} target="_blank" rel="noreferrer" className="pod-map-link"><MapPin size={15}/> View submitted coordinates on map</a>}
    {proof.recipientSignature && <div className="pod-image-group"><h4>Recipient signature</h4><a href={proof.recipientSignature} target="_blank" rel="noreferrer"><img className="pod-signature" src={proof.recipientSignature} alt="Recipient signature"/></a></div>}
    {[["Arrival / reached-location photos", proof.arrivalPhotos], ["Delivery photos", proof.deliveryPhotos]].map(([heading, photos]) => photos?.length > 0 && <div className="pod-image-group" key={heading}><h4>{heading}</h4><div className="pod-previews pod-view-photos">{photos.map((photo,i)=><figure key={photo._id || i}><a href={photo.data} target="_blank" rel="noreferrer"><img src={photo.data} alt={photo.caption || heading}/></a><figcaption>{photo.caption || heading}{photo.latitude != null && photo.longitude != null ? ` · ${photo.latitude}, ${photo.longitude}` : ""}</figcaption></figure>)}</div></div>)}
  </div>;
}

function DriverProof() {
  const [trips,setTrips]=useState([]), [tripId,setTripId]=useState(""), [deliveryStatus,setDeliveryStatus]=useState("DELIVERED");
  const [arrivalPhotos,setArrivalPhotos]=useState([]), [deliveryPhotos,setDeliveryPhotos]=useState([]);
  const [recipientName,setRecipientName]=useState(""), [recipientConfirmation,setRecipientConfirmation]=useState("");
  const [signature,setSignature]=useState(""), [notes,setNotes]=useState(""), [failureReason,setFailureReason]=useState(""), [partialDeliveryDetails,setPartialDeliveryDetails]=useState("");
  const [coords,setCoords]=useState({latitude:null,longitude:null}), [loading,setLoading]=useState(true), [saving,setSaving]=useState(false), [error,setError]=useState(""), [message,setMessage]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await apiRequest("/api/proof-of-delivery/driver/trips");setTrips(r.trips||[]);setTripId(current=>current || (r.trips||[]).find(t=>!t.proofOfDelivery)?._id || "");}catch(e){setError(e.message)}finally{setLoading(false)}},[]);
  useEffect(()=>{load();},[load]);
  const selected=trips.find(t=>t._id===tripId);
  const captureLocation=()=>{setError("");if(!navigator.geolocation){setError("Location is not supported by this browser.");return;}navigator.geolocation.getCurrentPosition(p=>setCoords({latitude:p.coords.latitude,longitude:p.coords.longitude}),()=>setError("Unable to access location. Allow location permission or continue without GPS."),{enableHighAccuracy:true,timeout:10000});};
  const reset=()=>{setArrivalPhotos([]);setDeliveryPhotos([]);setRecipientName("");setRecipientConfirmation("");setSignature("");setNotes("");setFailureReason("");setPartialDeliveryDetails("");setCoords({latitude:null,longitude:null});setDeliveryStatus("DELIVERED");};
  const submit=async(e)=>{e.preventDefault();setSaving(true);setError("");setMessage("");try{const r=await apiRequest("/api/proof-of-delivery",{method:"POST",body:JSON.stringify({tripId,deliveryStatus,arrivalPhotos,deliveryPhotos,recipientName,recipientConfirmation,recipientSignature:signature,notes,failureReason,partialDeliveryDetails,...coords})});setMessage(r.message||"Proof submitted.");reset();await load();}catch(e){setError(e.message)}finally{setSaving(false)}};
  const signatureChange=async(e)=>{const file=e.target.files?.[0];if(!file){setSignature("");return;}try{setSignature(await readImage(file));setError("");}catch(err){setError(err.message);e.target.value="";}};
  return <DriverLayout title="Proof of Delivery" subtitle="Record arrival evidence and delivery outcomes">
    <div className="pod-toolbar"><div><h2>Proof of Delivery</h2><p>Submit photos and delivery confirmation for your assigned trips.</p></div><button className="pod-button" onClick={load} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
    {error&&<div className="pod-alert error">{error}</div>}{message&&<div className="pod-alert success">{message}</div>}
    <section className="pod-card"><h3><FileCheck2 size={19}/> Submit delivery evidence</h3>{loading?<p>Loading your trips…</p>:!trips.length?<p>No trips are currently available for Proof of Delivery.</p>:<form onSubmit={submit} className="pod-form">
      <label>Assigned trip<select required value={tripId} onChange={e=>{setTripId(e.target.value);reset();}}><option value="">Select trip</option>{trips.map(t=><option key={t._id} value={t._id} disabled={!!t.proofOfDelivery}>{t.tripId} · {t.pickupLocation} → {t.destination}{t.proofOfDelivery?" · Proof submitted":""}</option>)}</select></label>
      {selected&&<div className="pod-trip-summary"><b>{selected.tripId}</b><span>{selected.pickupLocation} → {selected.destination}</span><span>Customer: {selected.customer?.fullName||"—"} · Vehicle: {selected.vehicle?.registrationNumber||"—"}</span><span>Status: {statusLabel(selected.tripStatus)}</span></div>}
      <div className="pod-form-grid"><PhotoInput label="Arrival / reached-location photos" value={arrivalPhotos} onChange={setArrivalPhotos} otherPhotoCount={deliveryPhotos.length}/><PhotoInput label="Delivery photos" value={deliveryPhotos} onChange={setDeliveryPhotos} otherPhotoCount={arrivalPhotos.length}/></div>
      <div className="pod-form-grid"><label>Delivery outcome<select value={deliveryStatus} onChange={e=>setDeliveryStatus(e.target.value)}><option value="DELIVERED">Delivered</option><option value="PARTIALLY_DELIVERED">Partially delivered</option><option value="FAILED">Failed</option></select></label><div className="pod-location"><label>GPS location (optional)</label><button type="button" className="pod-button" onClick={captureLocation}><MapPin size={16}/> {coords.latitude!=null?"Location captured":"Capture current location"}</button>{coords.latitude!=null&&<small>{coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}</small>}</div></div>
      {deliveryStatus==="DELIVERED"&&<div className="pod-form-grid"><label>Recipient name<input value={recipientName} onChange={e=>setRecipientName(e.target.value)} required maxLength={160} placeholder="Person receiving the delivery"/></label><label>Recipient confirmation<input value={recipientConfirmation} onChange={e=>setRecipientConfirmation(e.target.value)} placeholder="e.g. Recipient confirmed receipt" maxLength={1000}/></label></div>}
      {deliveryStatus==="DELIVERED"&&<div className="pod-upload"><label>Optional recipient signature image</label><input type="file" accept="image/png,image/jpeg" onChange={signatureChange}/>{signature&&<img className="pod-signature" src={signature} alt="Recipient signature preview"/>}<small>Upload a scanned or photographed signature. Recipient confirmation can be used instead.</small></div>}
      {deliveryStatus==="PARTIALLY_DELIVERED"&&<label>Partial delivery details (required)<textarea value={partialDeliveryDetails} onChange={e=>setPartialDeliveryDetails(e.target.value)} required minLength={5} maxLength={1500} placeholder="What was delivered and what remains?"/></label>}
      {deliveryStatus==="FAILED"&&<label>Reason for failed delivery (required)<textarea value={failureReason} onChange={e=>setFailureReason(e.target.value)} required minLength={5} maxLength={1500} placeholder="Explain why the delivery could not be completed."/></label>}
      <label>Additional notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={3000} placeholder="Optional delivery notes"/></label>
      <p className="pod-hint">At least one arrival or delivery photo is required. Upload up to 3 photos total across both groups (800 KB each). Submission time is recorded by the server.</p>
      <button className="pod-button primary" type="submit" disabled={saving||!tripId}>{saving?"Submitting…":<><Camera size={16}/> Submit Proof of Delivery</>}</button>
    </form>}</section>
    {trips.some(t=>t.proofOfDelivery)&&<section className="pod-card"><h3>Previously submitted proof</h3>{trips.filter(t=>t.proofOfDelivery).map(t=><div className="pod-existing" key={t._id}><div><b>{t.tripId}</b><span>{t.pickupLocation} → {t.destination}</span><small>{fmt(t.proofOfDelivery.deliveryTimestamp)}</small></div><span className={`pod-badge ${statusClass(t.proofOfDelivery.deliveryStatus)}`}>{statusLabel(t.proofOfDelivery.deliveryStatus)}</span></div>)}</section>}
  </DriverLayout>;
}

function ProofList({ mode }) {
  const [proofs,setProofs]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[status,setStatus]=useState(""),[selected,setSelected]=useState(null);
  const load=useCallback(async()=>{setLoading(true);setError("");try{const endpoint=mode==="customer"?"/api/proof-of-delivery/customer":`/api/proof-of-delivery/manager${status?`?status=${encodeURIComponent(status)}`:""}`;const r=await apiRequest(endpoint);setProofs(r.proofs||[]);}catch(e){setError(e.message)}finally{setLoading(false)}},[mode,status]);
  useEffect(()=>{load();},[load]);
  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get("proofId");
    if (requestedId && proofs.length) {
      const requestedProof = proofs.find((item) => String(item._id) === requestedId);
      if (requestedProof) setSelected(requestedProof);
    }
  }, [proofs]);
  const content=<><div className="pod-toolbar"><div><h2>{mode==="customer"?"Delivery History":"Proof of Delivery Records"}</h2><p>{mode==="customer"?"Delivery evidence for your trips.":"Review submitted delivery evidence and exceptions."}</p></div><button className="pod-button" onClick={load} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
    {mode!=="customer"&&<div className="pod-filter"><label>Delivery status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All outcomes</option><option value="DELIVERED">Delivered</option><option value="PARTIALLY_DELIVERED">Partially delivered</option><option value="FAILED">Failed</option></select></label></div>}
    {error&&<div className="pod-alert error">{error}</div>}
    {loading?<div className="pod-card">Loading delivery records…</div>:!proofs.length?<div className="pod-card pod-empty">No delivery evidence is available yet.</div>:<div className="pod-record-grid">{proofs.map(p=><article className="pod-card pod-record" key={p._id}><div className="pod-record-head"><div><h3>{p.trip?.tripId||"Trip"}</h3><p>{p.trip?.pickupLocation||"—"} → {p.trip?.destination||"—"}</p></div><span className={`pod-badge ${statusClass(p.deliveryStatus)}`}>{statusLabel(p.deliveryStatus)}</span></div><div className="pod-record-meta"><span>Recorded: {fmt(p.deliveryTimestamp)}</span>{mode!=="customer"&&<span>Driver: {p.driver?.fullName||"—"}</span>}</div><div className="pod-mini-photos">{[...(p.arrivalPhotos||[]),...(p.deliveryPhotos||[])].slice(0,3).map((ph,i)=><a key={ph._id||i} href={ph.data} target="_blank" rel="noreferrer" aria-label="Open delivery photo in new tab"><img src={ph.data} alt="Delivery evidence"/></a>)}{!(p.arrivalPhotos?.length||p.deliveryPhotos?.length)&&<span>No photos</span>}</div><div className="pod-record-actions"><button className="pod-button" onClick={()=>setSelected(selected?._id===p._id?null:p)}>{selected?._id===p._id?"Hide details":"View complete evidence"}</button><a className="pod-button" href={`${window.location.pathname}?proofId=${encodeURIComponent(p._id)}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Open in new tab</a></div>{selected?._id===p._id&&<EvidenceList proof={p}/>}</article>)}</div>}
  </>;
  return mode==="customer"?<CustomerLayout title="Delivery History" subtitle="View your delivery confirmations and photo evidence">{content}</CustomerLayout>:content;
}

export default function ProofOfDelivery({ mode="driver" }) {
  if(mode==="driver") return <DriverProof/>;
  return <ProofList mode={mode}/>;
}
