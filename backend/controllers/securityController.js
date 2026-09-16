const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const RolePermission = require("../models/RolePermission");
const AuditLog = require("../models/AuditLog");
const { ROLE_PERMISSIONS } = require("../utils/permissions");

const ACTIONS = ["view", "create", "edit", "delete", "approve"];
const RESOURCES = ["users", "vehicles", "drivers", "trips", "expenses", "maintenance", "customers", "fuel", "invoices"];
const key = (r,a) => `${r}:${a}`;
const permissionKey = (r,a) => `${r}:${a}`;
const defaultFor = (role, resource, action) => {
  if (role === "SUPER_ADMIN") return true;
  const p = ROLE_PERMISSIONS[role] || [];
  const aliases = {
    users: "user", vehicles: "vehicle", drivers: "driver", trips: "trip", expenses: "finance", maintenance: "maintenance", customers: "customer", fuel: "finance", invoices: "invoice"
  };
  const prefix = aliases[resource];
  if (action === "view") return p.includes(`${prefix}:read`) || p.includes("*");
  if (action === "create" || action === "edit") return p.includes(`${prefix}:write`) || p.includes("*");
  if (action === "delete") return role === "FLEET_MANAGER" ? resource === "trips" : false;
  if (action === "approve") return role === "FLEET_MANAGER" && resource === "vehicles";
  return false;
};

async function ensureRole(role, updatedBy = null) {
  let doc = await RolePermission.findOne({ role });
  if (!doc) {
    const permissions = {};
    for (const r of RESOURCES) for (const a of ACTIONS) permissions[key(r,a)] = defaultFor(role,r,a);
    doc = await RolePermission.create({ role, permissions, updatedBy });
  }
  return doc;
}

async function getPermissions(req,res){
  try {
    const roles = Object.keys(ROLE_PERMISSIONS);
    const rows = await Promise.all(roles.map(r => ensureRole(r, req.user._id)));
    return res.json({success:true, roles: rows.map(x => ({role:x.role, permissions:Object.fromEntries(x.permissions)})), resources:RESOURCES, actions:ACTIONS});
  } catch(e){ console.error(e); return res.status(500).json({success:false,message:"Unable to load permissions."}); }
}
async function updatePermissions(req,res){
  try {
    const role=String(req.params.role||"").toUpperCase();
    if(!ROLE_PERMISSIONS[role]) return res.status(400).json({success:false,message:"Invalid role."});
    if(role==="SUPER_ADMIN") return res.status(403).json({success:false,message:"Super Admin permissions cannot be restricted."});
    const incoming=req.body?.permissions;
    if(!incoming || typeof incoming!=="object") return res.status(400).json({success:false,message:"Permissions object is required."});
    const doc=await ensureRole(role, req.user._id);
    for(const r of RESOURCES) for(const a of ACTIONS){ const k=key(r,a); if(Object.prototype.hasOwnProperty.call(incoming,k)) doc.permissions.set(k, Boolean(incoming[k])); }
    doc.updatedBy=req.user._id; await doc.save();
    await AuditLog.create({actor:req.user._id,method:req.method,path:req.originalUrl,action:"PERMISSION_UPDATE",resource:"ROLE_PERMISSION",statusCode:200,recordId:doc._id,metadata:{role}}).catch(()=>{});
    return res.json({success:true,message:"Role permissions updated.",role,permissions:Object.fromEntries(doc.permissions)});
  }catch(e){console.error(e);return res.status(500).json({success:false,message:"Unable to update permissions."});}
}
async function resetUserAccess(req,res){
  try{
    const user=await User.findById(req.params.userId).select("+password");
    if(!user) return res.status(404).json({success:false,message:"User not found."});
    if(user.role==="SUPER_ADMIN" && String(user._id)!==String(req.user._id)) return res.status(403).json({success:false,message:"Super Admin accounts are protected."});
    const temporaryPassword=String(req.body?.temporaryPassword||"").trim();
    if(temporaryPassword && (temporaryPassword.length<8 || !/[A-Za-z]/.test(temporaryPassword) || !/\d/.test(temporaryPassword))) return res.status(400).json({success:false,message:"Temporary password must be at least 8 characters and contain a letter and number."});
    const raw=temporaryPassword || `${crypto.randomBytes(5).toString("base64url")}A1`;
    user.password=await bcrypt.hash(raw,12); user.accessVersion=Number(user.accessVersion||0)+1; user.forcePasswordChange=true; user.resetPasswordTokenHash=null; user.resetPasswordExpires=null; await user.save();
    await AuditLog.create({actor:req.user._id,method:req.method,path:req.originalUrl,action:"RESET_USER_ACCESS",resource:"USER",recordId:user._id,statusCode:200,metadata:{targetRole:user.role}}).catch(()=>{});
    return res.json({success:true,message:"User access reset successfully. Existing sessions have been revoked and a password change is required.",temporaryPassword:raw});
  }catch(e){console.error(e);return res.status(500).json({success:false,message:"Unable to reset user access."});}
}
module.exports={getPermissions,updatePermissions,resetUserAccess,ensureRole,ACTIONS,RESOURCES};