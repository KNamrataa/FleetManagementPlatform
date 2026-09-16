const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  role: { type: String, required: true, unique: true, index: true },
  permissions: { type: Map, of: Boolean, default: {} },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });
module.exports = mongoose.model("RolePermission", schema);
