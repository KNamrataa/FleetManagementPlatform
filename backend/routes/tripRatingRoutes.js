const express=require("express");
const {authenticate,authorize}=require("../middleware/authMiddleware");
const c=require("../controllers/tripRatingController");
const router=express.Router();
router.get("/trips/:id",authenticate,authorize("CUSTOMER"),c.getTripRating);
router.put("/trips/:id",authenticate,authorize("CUSTOMER"),c.createOrUpdateTripRating);
router.get("/drivers/:id/summary",authenticate,authorize("FLEET_MANAGER","SUPER_ADMIN","TRIP_MANAGER","DISPATCHER","VIEWER"),c.getDriverRatingSummary);
module.exports=router;
