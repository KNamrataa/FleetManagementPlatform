const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0 },
  rate: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const schema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true, index: true, trim: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", default: null, index: true },
  invoiceDate: { type: Date, required: true, index: true },
  dueDate: { type: Date, required: true, index: true },
  items: { type: [itemSchema], default: [] },
  subtotal: { type: Number, min: 0, default: 0 },
  taxAmount: { type: Number, min: 0, default: 0 },
  discount: { type: Number, min: 0, default: 0 },
  totalAmount: { type: Number, min: 0, default: 0 },
  paidAmount: { type: Number, min: 0, default: 0 },
  balanceAmount: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"], default: "DRAFT", index: true },
  notes: { type: String, trim: true, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

schema.pre("validate", function() {
  this.items = (this.items || []).map(item => {
    const value = item.toObject ? item.toObject() : item;
    value.amount = Number(value.quantity || 0) * Number(value.rate || 0);
    return value;
  });
  this.subtotal = this.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  this.totalAmount = Math.max(0, this.subtotal + Number(this.taxAmount || 0) - Number(this.discount || 0));
  this.balanceAmount = Math.max(0, this.totalAmount - Number(this.paidAmount || 0));
});

schema.index({ customer: 1, status: 1 });
schema.index({ customer: 1, status: 1, invoiceDate: -1 });
schema.index({ dueDate: 1, status: 1 });

module.exports = mongoose.model("Invoice", schema);
