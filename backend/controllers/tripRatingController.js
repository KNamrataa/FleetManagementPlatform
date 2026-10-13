const mongoose = require("mongoose");
const Trip = require("../models/Trip");
const TripRating = require("../models/TripRating");
const fail = (res,status,message)=>res.status(status).json({success:false,message});
const validId=id=>mongoose.Types.ObjectId.isValid(id);
const DRIVER_FIELDS=["safety","professionalism","communication","punctuality"];
const SERVICE_FIELDS=["pickup","tripExperience","punctuality","vehicleCondition"];
const POSITIVE_TAGS=["Safe driving","Friendly","Professional","On time","Good communication","Clean vehicle","Smooth trip","Comfortable"];
const ISSUE_TAGS=["Driver was late","Unsafe driving","Poor communication","Vehicle cleanliness","Vehicle condition","Route issue","Long waiting time","Other"];
const RECOMMENDATION_OPTIONS=["Definitely","Probably","Not sure","Probably not","Definitely not"];
const normalizeDetails=(value,fields)=>{const out={};const src=value&&typeof value==="object"?value:{};for(const key of fields){if(src[key]===null||src[key]===undefined||src[key]==="")out[key]=null;else{const n=Number(src[key]);if(!Number.isInteger(n)||n<1||n>5)throw new Error(`${key} rating must be a whole number from 1 to 5.`);out[key]=n;}}return out;};
const normalizeTags=(value,allowed)=>Array.isArray(value)?[...new Set(value.map(x=>String(x).trim()).filter(x=>allowed.includes(x)))]:[];

async function getTripRating(req,res){
  try {
    if(!validId(req.params.id)) return fail(res,400,"Invalid trip ID.");
    const trip=await Trip.findOne({_id:req.params.id,customer:req.user._id}).select("tripStatus driver tripId").lean();
    if(!trip) return fail(res,404,"Trip not found.");
    const rating=await TripRating.findOne({trip:trip._id,customer:req.user._id}).populate("driver","fullName").lean();
    return res.json({success:true,eligible:trip.tripStatus==="COMPLETED"&&Boolean(trip.driver),rating:rating||null,options:{positiveTags:POSITIVE_TAGS,issueTags:ISSUE_TAGS,recommendations:RECOMMENDATION_OPTIONS}});
  } catch(e){console.error("Get trip rating error:",e);return fail(res,500,"Unable to load trip rating.");}
}

async function createOrUpdateTripRating(req,res){
  try {
    if(!validId(req.params.id)) return fail(res,400,"Invalid trip ID.");
    const trip=await Trip.findOne({_id:req.params.id,customer:req.user._id});
    if(!trip) return fail(res,404,"Trip not found.");
    if(trip.tripStatus!=="COMPLETED") return fail(res,409,"You can rate a trip only after it is completed.");
    if(!trip.driver) return fail(res,409,"This completed trip has no assigned driver to rate.");
    const driverRating=Number(req.body?.driverRating), serviceRating=Number(req.body?.serviceRating);
    if(!Number.isInteger(driverRating)||driverRating<1||driverRating>5) return fail(res,400,"Driver rating must be a whole number from 1 to 5.");
    if(!Number.isInteger(serviceRating)||serviceRating<1||serviceRating>5) return fail(res,400,"Service rating must be a whole number from 1 to 5.");
    let driverDetails,serviceDetails;
    try { driverDetails=normalizeDetails(req.body?.driverDetails,DRIVER_FIELDS); serviceDetails=normalizeDetails(req.body?.serviceDetails,SERVICE_FIELDS); }
    catch(e){return fail(res,400,e.message);}
    const positiveTags=normalizeTags(req.body?.positiveTags,POSITIVE_TAGS);
    const issueTags=normalizeTags(req.body?.issueTags,ISSUE_TAGS);
    const comment=String(req.body?.comment||"").trim(); if(comment.length>1000)return fail(res,400,"Comment cannot exceed 1000 characters.");
    const otherIssue=String(req.body?.otherIssue||"").trim(); if(otherIssue.length>500)return fail(res,400,"Other issue description cannot exceed 500 characters.");
    const recommendation=String(req.body?.recommendation||"").trim(); if(recommendation && !RECOMMENDATION_OPTIONS.includes(recommendation))return fail(res,400,"Invalid recommendation option.");
    const rating=await TripRating.findOneAndUpdate({trip:trip._id,customer:req.user._id},{trip:trip._id,customer:req.user._id,driver:trip.driver,driverRating,serviceRating,driverDetails,serviceDetails,positiveTags,issueTags,comment,otherIssue,recommendation},{new:true,upsert:true,setDefaultsOnInsert:true,runValidators:true}).populate("driver","fullName").lean();
    return res.json({success:true,message:"Your trip rating has been saved.",rating});
  } catch(e){console.error("Save trip rating error:",e);return fail(res,e.code===11000?409:400,e.code===11000?"A rating already exists for this trip. Please refresh and try again.":e.message||"Unable to save trip rating.");}
}

async function getDriverRatingSummary(req,res){
  try {
    if(!validId(req.params.id)) return fail(res,400,"Invalid driver ID.");
    const match={driver:new mongoose.Types.ObjectId(req.params.id)};
    const [summary,distribution,recent,detailAgg,tagsAgg,lowRatings]=await Promise.all([
      TripRating.aggregate([{$match:match},{$group:{_id:null,driverAverage:{$avg:"$driverRating"},serviceAverage:{$avg:"$serviceRating"},ratingCount:{$sum:1},fiveStar:{$sum:{$cond:[{$and:[{$eq:["$driverRating",5]},{$eq:["$serviceRating",5]}]},1,0]}},lowRatingCount:{$sum:{$cond:[{$or:[{$lte:["$driverRating",2]},{$lte:["$serviceRating",2]}]},1,0]}},recommendYes:{$sum:{$cond:[{$in:["$recommendation",["Definitely","Probably"]]},1,0]}}}}]),
      TripRating.aggregate([{$match:match},{$group:{_id:"$driverRating",count:{$sum:1}}},{$sort:{_id:-1}}]),
      TripRating.find(match).sort({createdAt:-1}).limit(10).populate("customer","fullName").populate("trip","tripId pickupLocation destination").lean(),
      TripRating.aggregate([{$match:match},{$group:{_id:null,safety:{$avg:"$driverDetails.safety"},professionalism:{$avg:"$driverDetails.professionalism"},communication:{$avg:"$driverDetails.communication"},driverPunctuality:{$avg:"$driverDetails.punctuality"},pickup:{$avg:"$serviceDetails.pickup"},tripExperience:{$avg:"$serviceDetails.tripExperience"},servicePunctuality:{$avg:"$serviceDetails.punctuality"},vehicleCondition:{$avg:"$serviceDetails.vehicleCondition"}}}]),
      TripRating.aggregate([{$match:match},{$unwind:"$positiveTags"},{$group:{_id:"$positiveTags",count:{$sum:1}}},{$sort:{count:-1}}]),
      TripRating.find({...match,$or:[{driverRating:{$lte:2}},{serviceRating:{$lte:2}}]}).sort({createdAt:-1}).limit(10).populate("customer","fullName").populate("trip","tripId pickupLocation destination").lean(),
    ]);
    const s=summary[0]||{};const d=detailAgg[0]||{};
    const avg=v=>v==null?null:Number(Number(v).toFixed(2));
    return res.json({success:true,summary:{driverAverage:avg(s.driverAverage)||0,serviceAverage:avg(s.serviceAverage)||0,ratingCount:Number(s.ratingCount||0),fiveStarCount:Number(s.fiveStar||0),lowRatingCount:Number(s.lowRatingCount||0),recommendationPositiveCount:Number(s.recommendYes||0),recommendationPositiveRate:Number(s.ratingCount?((Number(s.recommendYes||0)/Number(s.ratingCount))*100).toFixed(1):0)},distribution:distribution.reduce((a,x)=>({...a,[x._id]:x.count}),{}),details:{safety:avg(d.safety),professionalism:avg(d.professionalism),communication:avg(d.communication),driverPunctuality:avg(d.driverPunctuality),pickup:avg(d.pickup),tripExperience:avg(d.tripExperience),servicePunctuality:avg(d.servicePunctuality),vehicleCondition:avg(d.vehicleCondition)},positiveTags:tagsAgg.slice(0,8),recent,lowRatings});
  } catch(e){console.error("Driver rating summary error:",e);return fail(res,500,"Unable to load driver rating summary.");}
}
module.exports={getTripRating,createOrUpdateTripRating,getDriverRatingSummary};