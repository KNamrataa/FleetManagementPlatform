const User=require("../models/User");
const Vehicle=require("../models/Vehicle");
const DriverProfile=require("../models/DriverProfile");
const Trip=require("../models/Trip");
const TripRequest=require("../models/TripRequest");
const FuelExpense=require("../models/FuelExpense");
const MaintenanceRecord=require("../models/MaintenanceRecord");
const MaintenanceSchedule=require("../models/MaintenanceSchedule");
const Expense=require("../models/Expense");
const TripExpense=require("../models/TripExpense");
const DriverExpense=require("../models/DriverExpense");
const Invoice=require("../models/Invoice");
const TripTracking=require("../models/TripTracking");
async function overviewExtras(req,res){
 try{
  const now=new Date(),ms=new Date(now.getFullYear(),now.getMonth(),1),nm=new Date(now.getFullYear(),now.getMonth()+1,1),soon=new Date(now.getTime()+7*86400000);
  const [customers,activeCustomers,newRequests,activeTrips,completedTrips,fuel,maint,exp,tripExp,driverExp,revenue,drivers,profiles,vehicles,tracking,dueSoon,overdue,completedMaint,recentRequests,topCustomers]=await Promise.all([
   User.countDocuments({role:"CUSTOMER"}),User.countDocuments({role:"CUSTOMER",isActive:true,accountStatus:{$ne:"INACTIVE"}}),TripRequest.countDocuments({createdAt:{$gte:ms}}),Trip.countDocuments({tripStatus:{$in:["ASSIGNED","IN_PROGRESS","PAUSED"]}}),Trip.countDocuments({tripStatus:"COMPLETED"}),
   FuelExpense.aggregate([{$match:{fuelDate:{$gte:ms,$lt:nm}}},{$group:{_id:null,total:{$sum:"$totalAmount"}}}]),
   MaintenanceRecord.aggregate([{$match:{completionDate:{$gte:ms,$lt:nm}}},{$group:{_id:null,total:{$sum:"$totalCost"}}}]),
   Expense.aggregate([{$match:{expenseDate:{$gte:ms,$lt:nm},status:{$ne:"REJECTED"}}},{$group:{_id:"$category",total:{$sum:"$amount"}}}]),
   TripExpense.aggregate([{$match:{expenseDate:{$gte:ms,$lt:nm},status:{$ne:"REJECTED"}}},{$group:{_id:null,total:{$sum:"$amount"}}}]),
   DriverExpense.aggregate([{$match:{expenseDate:{$gte:ms,$lt:nm},status:{$ne:"REJECTED"}}},{$group:{_id:null,total:{$sum:"$amount"}}}]),
   Invoice.aggregate([{$match:{invoiceDate:{$gte:ms,$lt:nm},status:{$ne:"CANCELLED"}}},{$group:{_id:null,total:{$sum:"$totalAmount"}}}]),
   User.find({role:"DRIVER"}).select("fullName isActive accountStatus").lean(),DriverProfile.find({}).select("user status availability assignedVehicle").lean(),Vehicle.find({}).select("registrationNumber vehicleNumber vehicleType status assignedDriver").populate("assignedDriver","fullName").lean(),
   TripTracking.find({}).sort({recordedAt:-1}).limit(1000).populate("trip","tripId tripStatus").populate("driver","fullName").lean(),
   MaintenanceSchedule.find({nextServiceDate:{$gte:now,$lte:soon}}).populate("vehicle","registrationNumber vehicleNumber").lean(),MaintenanceSchedule.find({$or:[{status:"OVERDUE"},{nextServiceDate:{$lt:now}}]}).populate("vehicle","registrationNumber vehicleNumber").lean(),MaintenanceRecord.countDocuments({completionDate:{$gte:ms,$lt:nm}}),
   TripRequest.find({}).populate("customer","fullName email").sort({createdAt:-1}).limit(8).lean(),
   Trip.aggregate([{$match:{customer:{$ne:null}}},{$group:{_id:"$customer",trips:{$sum:1},completed:{$sum:{$cond:[{$eq:["$tripStatus","COMPLETED"]},1,0]}}}},{$sort:{trips:-1}},{$limit:5},{$lookup:{from:"users",localField:"_id",foreignField:"_id",as:"customer"}},{$unwind:"$customer"},{$project:{_id:1,name:"$customer.fullName",trips:1,completed:1}}])
  ]);
  const categories=Object.fromEntries(exp.map(x=>[x._id,Number(x.total||0)])),fuelCost=Number(fuel[0]?.total||0),maintenanceCost=Number(maint[0]?.total||0),tripCost=Number(tripExp[0]?.total||0),driverCost=Number(driverExp[0]?.total||0),other=Object.entries(categories).filter(([k])=>!["FUEL","MAINTENANCE","TRIP","DRIVER_ALLOWANCE"].includes(k)).reduce((s,[,v])=>s+v,0);
  const pmap=new Map(profiles.map(p=>[String(p.user),p])),ds={AVAILABLE:0,ON_TRIP:0,OFF_DUTY:0,INACTIVE:0};
  drivers.forEach(d=>{const p=pmap.get(String(d._id)),st=!d.isActive||d.accountStatus==="INACTIVE"?"INACTIVE":p?.status||"AVAILABLE";ds[st]=(ds[st]||0)+1;});
  const latest=new Map();tracking.forEach(t=>{const id=String(t.vehicle||"");if(id&&!latest.has(id))latest.set(id,t);});
  const liveFleet=vehicles.map(v=>{const t=latest.get(String(v._id));return {...v,tracking:t?{latitude:t.latitude,longitude:t.longitude,currentLocation:t.currentLocation,speed:t.speed,recordedAt:t.recordedAt,driver:t.driver,trip:t.trip}:null};});
  return res.json({success:true,financial:{totalExpenses:fuelCost+maintenanceCost+tripCost+driverCost+other,fuelCost,maintenanceCost,tripExpenses:tripCost,driverExpenses:driverCost,otherExpenses:other,revenue:Number(revenue[0]?.total||0),categories},customers:{total:customers,active:activeCustomers,newRequests,activeTrips,completedTrips,recentRequests,topCustomers},maintenance:{vehiclesUnderMaintenance:vehicles.filter(v=>v.status==="MAINTENANCE").length,serviceDueSoon:dueSoon.length,overdue:overdue.length,completedThisMonth:completedMaint,totalCost:maintenanceCost,alerts:[...overdue,...dueSoon].slice(0,8)},drivers:{total:drivers.length,status:ds,onTrips:ds.ON_TRIP||0,withoutAssignedTrips:drivers.filter(d=>!pmap.get(String(d._id))?.assignedVehicle).length},liveFleet});
 }catch(e){console.error(e);return res.status(500).json({success:false,message:"Unable to load Main Overview enhancements."});}
}
module.exports={overviewExtras};
