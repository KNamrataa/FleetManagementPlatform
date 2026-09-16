const express=require("express");
const {authenticate,authorize}=require("../middleware/authMiddleware");
const c=require("../controllers/fleetExtrasController");
const r=express.Router();
const a=[authenticate,authorize("FLEET_MANAGER","SUPER_ADMIN")];
r.get("/live-fleet",...a,c.liveFleet);
r.get("/vehicles/:id/history",...a,c.vehicleHistory);
r.get("/drivers/performance",...a,c.driverPerformance);
module.exports=r;
