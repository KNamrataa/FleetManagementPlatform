const express=require("express");
const {authenticate,authorize}=require("../middleware/authMiddleware");
const {overviewExtras}=require("../controllers/mainOverviewController");
const r=express.Router();
r.get("/",authenticate,authorize("SUPER_ADMIN"),overviewExtras);
module.exports=r;
