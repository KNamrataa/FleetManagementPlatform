const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const { paginationParams, paginationMeta } = require("../utils/pagination");
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const validId = (id) => mongoose.Types.ObjectId.isValid(id);

async function listNotifications(req, res) {
  try {
    const { page, limit, skip } = paginationParams(req, { limit: 20, max: 100 });
    const filter = { recipient: req.user._id };
    if (req.query.category) filter.category = String(req.query.category).toUpperCase();
    if (req.query.read === "true") filter.isRead = true;
    if (req.query.read === "false") filter.isRead = false;
    const [total, notifications, unreadCount] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments({ recipient: req.user._id, isRead: false }),
    ]);
    return res.json({ success: true, notifications, unreadCount, pagination: paginationMeta(page, limit, total) });
  } catch (e) { console.error("List notifications error:", e); return fail(res, 500, "Unable to load notifications."); }
}
async function unreadCount(req, res) {
  try { return res.json({ success:true, unreadCount: await Notification.countDocuments({ recipient:req.user._id, isRead:false }) }); }
  catch(e){ return fail(res,500,"Unable to load notification count."); }
}
async function markRead(req,res){
  try { if(!validId(req.params.id)) return fail(res,400,"Invalid notification ID."); const notification=await Notification.findOneAndUpdate({_id:req.params.id,recipient:req.user._id},{$set:{isRead:true,readAt:new Date()}},{returnDocument:"after"}).lean(); if(!notification)return fail(res,404,"Notification not found."); return res.json({success:true,notification}); }
  catch(e){return fail(res,500,"Unable to mark notification as read.");}
}
async function markAllRead(req,res){
  try{await Notification.updateMany({recipient:req.user._id,isRead:false},{$set:{isRead:true,readAt:new Date()}});return res.json({success:true,message:"All notifications marked as read."});}catch(e){return fail(res,500,"Unable to mark notifications as read.");}
}
async function deleteNotification(req,res){
  try{if(!validId(req.params.id))return fail(res,400,"Invalid notification ID.");const result=await Notification.deleteOne({_id:req.params.id,recipient:req.user._id});if(!result.deletedCount)return fail(res,404,"Notification not found.");return res.json({success:true,message:"Notification deleted."});}catch(e){return fail(res,500,"Unable to delete notification.");}
}
module.exports={listNotifications,unreadCount,markRead,markAllRead,deleteNotification};
