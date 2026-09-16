const mongoose = require("mongoose");
const { safeNotify, notifyUsers } = require("../services/notificationService");
const Expense = require("../models/Expense");
const FuelExpense = require("../models/FuelExpense");
const TripExpense = require("../models/TripExpense");
const DriverExpense = require("../models/DriverExpense");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const Budget = require("../models/Budget");
const Vehicle = require("../models/Vehicle");
const User = require("../models/User");
const Trip = require("../models/Trip");
const MaintenanceRecord = require("../models/MaintenanceRecord");

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const ok = (res, data = {}, message) => res.status(200).json({ success: true, ...(message ? { message } : {}), ...data });
const validId = id => mongoose.Types.ObjectId.isValid(id);
const n = value => Number(value || 0);
const escapeRx = value => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "UPI", "CARD", "CHEQUE", "OTHER"];
const EXPENSE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "PAID"];
const INVOICE_REVENUE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"];

function dateRange(query) {
  const { startDate, endDate } = query;
  if (!startDate && !endDate) return {};
  const range = {};
  if (startDate) {
    const d = new Date(startDate);
    if (Number.isNaN(d.getTime())) throw new Error("Invalid startDate.");
    d.setHours(0, 0, 0, 0); range.$gte = d;
  }
  if (endDate) {
    const d = new Date(endDate);
    if (Number.isNaN(d.getTime())) throw new Error("Invalid endDate.");
    d.setHours(23, 59, 59, 999); range.$lte = d;
  }
  if (range.$gte && range.$lte && range.$gte > range.$lte) throw new Error("startDate cannot be after endDate.");
  return range;
}
function paging(query) {
  const page = Math.max(1, parseInt(query.page || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || "20", 10)));
  return { page, limit, skip: (page - 1) * limit };
}
function listResult(data, total, page, limit) { return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }; }
function makeNumber(prefix) { return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`; }
async function ensureRef(model, id, label) { if (!id) return null; if (!validId(id)) throw new Error(`Invalid ${label}.`); const doc = await model.findById(id); if (!doc) throw new Error(`${label} not found.`); return doc; }
async function ensureVehicleDriverTrip(body) {
  const trip = body.trip ? await ensureRef(Trip, body.trip, "trip") : null;
  const vehicle = body.vehicle ? await ensureRef(Vehicle, body.vehicle, "vehicle") : null;
  const driver = body.driver ? await ensureRef(User, body.driver, "driver") : null;
  if (driver && driver.role !== "DRIVER") throw new Error("Selected user is not a driver.");
  if (trip) {
    if (body.vehicle && trip.vehicle && trip.vehicle.toString() !== body.vehicle) throw new Error("Vehicle does not match the selected trip.");
    if (body.driver && trip.driver && trip.driver.toString() !== body.driver) throw new Error("Driver does not match the selected trip.");
  }
  return { trip, vehicle, driver };
}
async function sum(model, match, field = "amount") { const rows = await model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: `$${field}` } } }]); return n(rows[0]?.total); }
async function sumFuelExpenses(dateMatch = null) {
  const nativeMatch = dateMatch ? { fuelDate: dateMatch } : {};
  const legacyMatch = { category: "FUEL", ...(dateMatch ? { expenseDate: dateMatch } : {}) };
  const [native, legacy] = await Promise.all([
    sum(FuelExpense, nativeMatch, "totalAmount"),
    sum(Expense, legacyMatch, "amount"),
  ]);
  return native + legacy;
}
async function monthlyRevenueExpenses() {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  const result = [];
  for (let i = 0; i < months.length; i++) {
    const start = months[i], end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const revenue = await sum(Invoice, { invoiceDate: { $gte: start, $lt: end }, status: { $in: INVOICE_REVENUE_STATUSES } }, "totalAmount");
    const [fuel, maint, trip, driver, other] = await Promise.all([
      sumFuelExpenses({ $gte: start, $lt: end }),
      sum(MaintenanceRecord, { completionDate: { $gte: start, $lt: end } }, "totalCost"),
      sum(TripExpense, { expenseDate: { $gte: start, $lt: end }, status: { $ne: "REJECTED" } }),
      sum(DriverExpense, { expenseDate: { $gte: start, $lt: end }, status: { $ne: "REJECTED" } }),
      sum(Expense, { expenseDate: { $gte: start, $lt: end }, category: { $nin: ["FUEL", "MAINTENANCE", "TRIP", "DRIVER_ALLOWANCE"] }, status: { $ne: "REJECTED" } }),
    ]);
    const expenses = fuel + maint + trip + driver + other;
    result.push({ month: start.toLocaleString("en-IN", { month: "short", year: "numeric" }), revenue, expenses, profit: revenue - expenses });
  }
  return result;
}

async function dashboard(req, res) {
  try {
    const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1); const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const base = { $ne: "REJECTED" };
    const [revenue, fuelExpenses, maintenanceExpenses, tripExpenses, driverExpenses, otherExpenses, pendingExpenses, approvedExpenses, paidExpenses, outstandingReceivables, invoiceCount, outstandingInvoices, paymentsReceived, paymentsPaid] = await Promise.all([
      sum(Invoice, { status: { $in: INVOICE_REVENUE_STATUSES } }, "totalAmount"),
      sumFuelExpenses(),
      sum(MaintenanceRecord, {}, "totalCost"),
      sum(TripExpense, { status: base, category: { $ne: "FUEL" } }),
      sum(DriverExpense, { status: base }),
      sum(Expense, { category: { $nin: ["FUEL", "MAINTENANCE", "TRIP", "DRIVER_ALLOWANCE"] }, status: base }),
      sum(Expense, { status: "PENDING" }),
      sum(Expense, { status: "APPROVED" }),
      sum(Expense, { status: "PAID" }),
      sum(Invoice, { status: { $in: INVOICE_REVENUE_STATUSES } }, "balanceAmount"),
      Invoice.countDocuments({}),
      Invoice.countDocuments({ status: { $in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] }, balanceAmount: { $gt: 0 } }),
      sum(Payment, { type: "RECEIVED", status: "COMPLETED" }),
      sum(Payment, { type: "PAID", status: "COMPLETED" }),
    ]);
    const expenses = fuelExpenses + maintenanceExpenses + tripExpenses + driverExpenses + otherExpenses;
    const monthMatch = { $gte: monthStart, $lt: nextMonth };
    const [monthRevenue, monthFuel, monthMaint, monthTrip, monthDriver, monthOther] = await Promise.all([
      sum(Invoice, { invoiceDate: monthMatch, status: { $in: INVOICE_REVENUE_STATUSES } }, "totalAmount"),
      sumFuelExpenses(monthMatch),
      sum(MaintenanceRecord, { completionDate: monthMatch }, "totalCost"),
      sum(TripExpense, { expenseDate: monthMatch, status: { $ne: "REJECTED" }, category: { $ne: "FUEL" } }),
      sum(DriverExpense, { expenseDate: monthMatch, status: { $ne: "REJECTED" } }),
      sum(Expense, { expenseDate: monthMatch, category: { $nin: ["FUEL", "MAINTENANCE", "TRIP", "DRIVER_ALLOWANCE"] }, status: { $ne: "REJECTED" } }),
    ]);
    const monthExpenses = monthFuel + monthMaint + monthTrip + monthDriver + monthOther;
    const [recentExpenses, recentInvoices, budgets, monthlyFinancials] = await Promise.all([
      Expense.find({}).populate("vehicle", "registrationNumber vehicleNumber").populate("driver", "fullName").sort({ createdAt: -1 }).limit(6).lean(),
      Invoice.find({ status: { $in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] }, balanceAmount: { $gt: 0 } }).populate("customer", "fullName email").sort({ dueDate: 1 }).limit(6).lean(),
      getBudgetsWithSpend(),
      monthlyRevenueExpenses(),
    ]);
    const recentTransactions = recentExpenses.map(x => ({ date: x.expenseDate, type: "Expense", description: `${x.category} — ${x.description}`, amount: x.amount, status: x.status }));
    return ok(res, { data: { revenue, expenses, netProfit: revenue - expenses, outstandingReceivables, fuelExpenses, maintenanceExpenses, tripExpenses, driverExpenses, otherExpenses, pendingExpenses, approvedExpenses, paidExpenses, invoiceCount, outstandingInvoices, paymentsReceived, paymentsPaid, currentMonthRevenue: monthRevenue, currentMonthExpenses: monthExpenses, currentMonthProfit: monthRevenue - monthExpenses, monthlyFinancials, recentTransactions, outstandingInvoiceRows: recentInvoices, budgetAlerts: budgets.filter(b => b.utilization >= 80).slice(0, 6) } });
  } catch (e) { console.error("Finance dashboard error:", e); return fail(res, 500, "Unable to load finance dashboard."); }
}

async function getBudgetsWithSpend() {
  const budgets = await Budget.find({}).sort({ startDate: -1 }).lean();
  const now = new Date();
  return Promise.all(budgets.map(async b => {
    const range = { $gte: b.startDate, $lte: b.endDate };
    let spent = 0;
    if (b.category === "FUEL") spent = await sumFuelExpenses(range);
    else if (b.category === "MAINTENANCE") spent = await sum(MaintenanceRecord, { completionDate: range }, "totalCost");
    else if (b.category === "TRIP") spent = await sum(TripExpense, { expenseDate: range, status: { $ne: "REJECTED" } });
    else if (b.category === "DRIVER") spent = await sum(DriverExpense, { expenseDate: range, status: { $ne: "REJECTED" } });
    else spent = await sum(Expense, { expenseDate: range, category: { $nin: ["FUEL", "MAINTENANCE", "TRIP", "DRIVER_ALLOWANCE"] }, status: { $ne: "REJECTED" } });
    const utilization = b.allocatedAmount > 0 ? (spent / b.allocatedAmount) * 100 : spent > 0 ? 100 : 0;
    return { ...b, spentAmount: spent, remainingAmount: b.allocatedAmount - spent, utilization, calculatedStatus: utilization > 100 ? "EXCEEDED" : b.status };
  }));
}

function buildListFilter(query, fields, dateField) {
  const filter = {}; const q = String(query.search || "").trim();
  if (q) filter.$or = fields.map(f => ({ [f]: new RegExp(escapeRx(q), "i") }));
  for (const key of ["status", "category", "vehicle", "driver", "trip", "customer"]) if (query[key] && validId(query[key])) filter[key] = query[key];
  if (dateField) { const r = dateRange(query); if (Object.keys(r).length) filter[dateField] = r; }
  return filter;
}

async function listModel(Model, req, res, options) {
  try {
    const filter = buildListFilter(req.query, options.searchFields || [], options.dateField);
    const { page, limit, skip } = paging(req.query); const [data, total] = await Promise.all([
      Model.find(filter).populate(options.populate || []).sort({ [options.sortField || "createdAt"]: -1 }).skip(skip).limit(limit).lean(),
      Model.countDocuments(filter),
    ]); return ok(res, listResult(data, total, page, limit));
  } catch (e) { console.error(options.label, e); return fail(res, 500, `Unable to load ${options.label}.`); }
}

async function createExpense(req, res) { try { const b = req.body; if (n(b.amount) <= 0 || !b.description || !b.category) return fail(res, 400, "Valid category, description and amount are required."); if (b.vehicle && !validId(b.vehicle)) return fail(res, 400, "Invalid vehicle."); if (b.driver && !validId(b.driver)) return fail(res, 400, "Invalid driver."); if (b.trip && !validId(b.trip)) return fail(res, 400, "Invalid trip."); const doc = await Expense.create({ ...b, expenseNumber: b.expenseNumber || makeNumber("EXP"), amount: n(b.amount), expenseDate: new Date(b.expenseDate || Date.now()), status: "PENDING", createdBy: req.user._id, approvedBy: null, approvedAt: null, paidAt: null }); return res.status(201).json({ success: true, message: "Expense created.", expense: doc }); } catch (e) { console.error(e); return fail(res, e.code === 11000 ? 409 : 400, e.code === 11000 ? "Expense number already exists." : e.message || "Unable to create expense."); } }
async function createFuel(req, res) { try { const b=req.body; if (!validId(b.vehicle)) return fail(res,400,"A valid vehicle is required."); if(n(b.litres)<0||n(b.pricePerLitre)<0) return fail(res,400,"Litres and price must be zero or greater."); const { vehicle, driver, trip }=await ensureVehicleDriverTrip(b); const doc=await FuelExpense.create({ ...b, fuelNumber:b.fuelNumber||makeNumber("FUEL"), vehicle:vehicle._id, driver:driver?driver._id:null, trip:trip?trip._id:null, litres:n(b.litres), pricePerLitre:n(b.pricePerLitre), totalAmount:n(b.litres)*n(b.pricePerLitre), fuelDate:new Date(b.fuelDate||Date.now()), createdBy:req.user._id }); return res.status(201).json({success:true,message:"Fuel expense created.",fuel:doc}); } catch(e){ console.error(e); return fail(res,e.code===11000?409:400,e.code===11000?"Fuel number already exists.":e.message||"Unable to create fuel expense."); } }

async function listFuel(req, res) {
  try {
    const filter = buildListFilter(req.query, ["fuelNumber", "fuelStation", "fuelType"], "fuelDate");
    const { page, limit, skip } = paging(req.query);
    const [nativeRows, legacyRows] = await Promise.all([
      FuelExpense.find(filter).populate([["vehicle", "registrationNumber vehicleNumber vehicleType"], ["driver", "fullName"], ["trip", "tripId"]]).sort({ fuelDate: -1 }).lean(),
      Expense.find({ category: "FUEL", ...(req.query.vehicle && validId(req.query.vehicle) ? { vehicle: req.query.vehicle } : {}), ...(req.query.driver && validId(req.query.driver) ? { driver: req.query.driver } : {}), ...(req.query.trip && validId(req.query.trip) ? { trip: req.query.trip } : {}) })
        .populate([["vehicle", "registrationNumber vehicleNumber vehicleType"], ["driver", "fullName"], ["trip", "tripId"]]).sort({ expenseDate: -1 }).lean(),
    ]);
    const normalizedLegacy = legacyRows.map(x => ({
      _id: x._id,
      fuelNumber: x.expenseNumber,
      fuelDate: x.expenseDate,
      vehicle: x.vehicle || null,
      driver: x.driver || null,
      trip: x.trip || null,
      fuelType: "OTHER",
      litres: Number(x.litres || 0),
      pricePerLitre: Number(x.pricePerLitre || 0),
      totalAmount: Number(x.amount || 0),
      source: "Expense",
      legacyExpense: true,
    }));
    const rows = [...nativeRows.map(x => ({ ...x, source: "FuelExpense", legacyExpense: false })), ...normalizedLegacy]
      .sort((a, b) => new Date(b.fuelDate || 0) - new Date(a.fuelDate || 0));
    const total = rows.length;
    return ok(res, listResult(rows.slice(skip, skip + limit), total, page, limit));
  } catch (e) {
    console.error("Fuel expense list error", e);
    return fail(res, 500, "Unable to load fuel expenses.");
  }
}
async function createTripExpense(req,res){ try{ const b=req.body;if(n(b.amount)<=0)return fail(res,400,"Amount must be greater than zero.");const trip=await ensureRef(Trip,b.trip,"trip");const doc=await TripExpense.create({...b,expenseNumber:b.expenseNumber||makeNumber("TRX"),trip:trip._id,vehicle:trip.vehicle||null,driver:trip.driver||null,amount:n(b.amount),expenseDate:new Date(b.expenseDate||Date.now()),createdBy:req.user._id,status:"PENDING"});return res.status(201).json({success:true,message:"Trip expense created.",expense:doc});}catch(e){console.error(e);return fail(res,e.code===11000?409:400,e.code===11000?"Expense number already exists.":e.message||"Unable to create trip expense.");}}
async function createDriverExpense(req,res){ try{const b=req.body;if(!validId(b.driver)||n(b.amount)<=0)return fail(res,400,"Valid driver and amount are required.");const driver=await ensureRef(User,b.driver,"driver");if(driver.role!=="DRIVER")return fail(res,400,"Selected user is not a driver.");let trip=null;if(b.trip){trip=await ensureRef(Trip,b.trip,"trip");if(trip.driver&&trip.driver.toString()!==driver._id.toString())return fail(res,400,"Trip is not assigned to this driver.");}const doc=await DriverExpense.create({...b,expenseNumber:b.expenseNumber||makeNumber("DRV"),driver:driver._id,trip:trip?trip._id:null,vehicle:trip?.vehicle||b.vehicle||null,amount:n(b.amount),advanceAmount:n(b.advanceAmount),settledAmount:n(b.settledAmount),expenseDate:new Date(b.expenseDate||Date.now()),createdBy:req.user._id,status:"PENDING"});return res.status(201).json({success:true,message:"Driver expense created.",expense:doc});}catch(e){console.error(e);return fail(res,e.code===11000?409:400,e.code===11000?"Expense number already exists.":e.message||"Unable to create driver expense.");}}

async function updateSimple(Model, req, res, options={}) { try { if(!validId(req.params.id))return fail(res,400,"Invalid record id.");const doc=await Model.findById(req.params.id);if(!doc)return fail(res,404,"Record not found.");const body={...req.body};delete body.createdBy;delete body.approvedBy;delete body.approvedAt;delete body.paidAt; if(options.lockStatus) delete body.status; Object.assign(doc,body);await doc.save();return ok(res,{[options.key||"record"]:doc},"Record updated.");}catch(e){console.error(e);return fail(res,e.code===11000?409:400,e.code===11000?"A unique record number already exists.":e.message||"Unable to update record.");}}
async function remove(Model,req,res){try{if(!validId(req.params.id))return fail(res,400,"Invalid record id.");const doc=await Model.findById(req.params.id);if(!doc)return fail(res,404,"Record not found.");if(["APPROVED","PAID","SETTLED"].includes(doc.status))return fail(res,409,"Processed financial records cannot be deleted.");await doc.deleteOne();return ok(res,{},"Record deleted.");}catch(e){console.error(e);return fail(res,500,"Unable to delete record.");}}
async function action(Model,req,res,actionName){try{if(!validId(req.params.id))return fail(res,400,"Invalid record id.");const doc=await Model.findById(req.params.id);if(!doc)return fail(res,404,"Record not found.");if(actionName==="approve"){if(doc.status!=="PENDING")return fail(res,409,"Only pending records can be approved.");doc.status="APPROVED";doc.approvedBy=req.user._id;doc.approvedAt=new Date();}
else if(actionName==="reject"){if(!["PENDING","APPROVED"].includes(doc.status))return fail(res,409,"This record cannot be rejected now.");doc.status="REJECTED";}
else if(actionName==="pay"){if(doc.status!=="APPROVED")return fail(res,409,"Only approved records can be marked paid.");doc.status="PAID";doc.paidAt=new Date();}
else if(actionName==="settle"){if(doc.status!=="PAID")return fail(res,409,"Only paid driver expenses can be settled.");doc.settledAmount=n(req.body.settledAmount);doc.status=doc.remainingAmount<=0?"SETTLED":"PAID";}
await doc.save();return ok(res,{record:doc},`Record ${actionName === "pay" ? "paid" : actionName + "d"}.`);}catch(e){console.error(e);return fail(res,400,e.message||"Unable to update financial status.");}}

async function createInvoice(req,res){try{const b=req.body;if(b.trip&&!validId(b.trip))return fail(res,400,"Invalid trip.");let trip=null;if(b.trip){trip=await ensureRef(Trip,b.trip,"trip");}let customerId=trip?.customer||b.customer;if(!validId(customerId))return fail(res,400,"A valid customer is required.");const customer=await ensureRef(User,customerId,"customer");if(customer.role!=="CUSTOMER")return fail(res,400,"Invoice customer must have CUSTOMER role.");const items=Array.isArray(b.items)?b.items:[];if(!items.length)return fail(res,400,"At least one invoice item is required.");const doc=await Invoice.create({invoiceNumber:b.invoiceNumber||makeNumber("INV"),customer:customer._id,trip:trip?trip._id:null,invoiceDate:new Date(b.invoiceDate||Date.now()),dueDate:new Date(b.dueDate||Date.now()),items, taxAmount:n(b.taxAmount),discount:n(b.discount),notes:b.notes||"",createdBy:req.user._id,status:"DRAFT"});return res.status(201).json({success:true,message:"Invoice created.",invoice:doc});}catch(e){console.error(e);return fail(res,e.code===11000?409:400,e.code===11000?"Invoice number already exists.":e.message||"Unable to create invoice.");}}
async function invoiceUpdate(req,res){try{if(!validId(req.params.id))return fail(res,400,"Invalid invoice id.");const doc=await Invoice.findById(req.params.id);if(!doc)return fail(res,404,"Invoice not found.");if(["PAID","CANCELLED"].includes(doc.status))return fail(res,409,"This invoice cannot be edited.");const b=req.body;if(b.trip){const trip=await ensureRef(Trip,b.trip,"trip");doc.trip=trip._id;doc.customer=trip.customer||doc.customer;}if(b.customer){const c=await ensureRef(User,b.customer,"customer");if(c.role!=="CUSTOMER")return fail(res,400,"Invoice customer must have CUSTOMER role.");doc.customer=c._id;}for(const key of ["invoiceDate","dueDate","items","taxAmount","discount","notes"])if(b[key]!==undefined)doc[key]=b[key];await doc.save();return ok(res,{invoice:doc},"Invoice updated.");}catch(e){console.error(e);return fail(res,400,e.message||"Unable to update invoice.");}}
async function issueInvoice(req,res){try{if(!validId(req.params.id))return fail(res,400,"Invalid invoice id.");const doc=await Invoice.findById(req.params.id);if(!doc)return fail(res,404,"Invoice not found.");if(doc.status!=="DRAFT")return fail(res,409,"Only draft invoices can be issued.");doc.status="ISSUED";await doc.save(); const io=req.app.get("io"); await safeNotify(() => notifyUsers({ io, recipients:[doc.customer], type:"INVOICE_ISSUED", title:"New Invoice", message:`Invoice ${doc.invoiceNumber} has been issued.`, link:"/customer/billing", data:{ invoiceId:doc._id, invoiceNumber:doc.invoiceNumber }, priority:"NORMAL" })); return ok(res,{invoice:doc},"Invoice issued.");}catch(e){return fail(res,400,e.message);}}
async function cancelInvoice(req,res){try{if(!validId(req.params.id))return fail(res,400,"Invalid invoice id.");const doc=await Invoice.findById(req.params.id);if(!doc)return fail(res,404,"Invoice not found.");if(doc.paidAmount>0)return fail(res,409,"An invoice with payments cannot be cancelled.");doc.status="CANCELLED";await doc.save();return ok(res,{invoice:doc},"Invoice cancelled.");}catch(e){return fail(res,400,e.message);}}

async function createPayment(req,res){try{const b=req.body;if(n(b.amount)<=0)return fail(res,400,"Payment amount must be greater than zero.");if(!PAYMENT_METHODS.includes(b.paymentMethod||"OTHER"))return fail(res,400,"Invalid payment method.");let invoice=null;if(b.invoice){invoice=await ensureRef(Invoice,b.invoice,"invoice");if(b.type!=="RECEIVED")return fail(res,400,"Invoice payments must use RECEIVED type.");if(invoice.status==="CANCELLED")return fail(res,409,"Cancelled invoice cannot receive payment.");if(n(b.amount)>n(invoice.balanceAmount))return fail(res,409,"Payment cannot exceed invoice balance.");}if(b.expense){await ensureRef(Expense,b.expense,"expense");if(b.type!=="PAID")return fail(res,400,"Expense payments must use PAID type.");}
const payment=await Payment.create({paymentNumber:b.paymentNumber||makeNumber("PAY"),type:b.type||"RECEIVED",invoice:invoice?invoice._id:null,customer:invoice?invoice.customer:null,expense:b.expense||null,amount:n(b.amount),paymentDate:new Date(b.paymentDate||Date.now()),paymentMethod:b.paymentMethod||"OTHER",referenceNumber:b.referenceNumber||"",notes:b.notes||"",createdBy:req.user._id,status:"PENDING"});return res.status(201).json({success:true,message:"Payment recorded as pending.",payment});}catch(e){console.error(e);return fail(res,e.code===11000?409:400,e.code===11000?"Payment number already exists.":e.message||"Unable to create payment.");}}
async function completePayment(req,res){try{if(!validId(req.params.id))return fail(res,400,"Invalid payment id.");const payment=await Payment.findById(req.params.id);if(!payment)return fail(res,404,"Payment not found.");if(payment.status!=="PENDING")return fail(res,409,"Only pending payments can be completed.");let invoice=null; if(payment.type==="RECEIVED"&&payment.invoice){invoice=await Invoice.findById(payment.invoice);if(!invoice)return fail(res,404,"Invoice not found.");const updated=await Invoice.findOneAndUpdate({_id:invoice._id,status:{$in:["ISSUED","PARTIALLY_PAID","OVERDUE"]},balanceAmount:{$gte:payment.amount}},{ $inc:{paidAmount:payment.amount,balanceAmount:-payment.amount}},{new:true});if(!updated)return fail(res,409,"Invoice balance changed. Refresh and try again.");invoice=updated;invoice.status=invoice.balanceAmount<=0?"PAID":"PARTIALLY_PAID";await invoice.save();}
payment.status="COMPLETED";await payment.save(); if (invoice?.customer) { const io=req.app.get("io"); await safeNotify(() => notifyUsers({ io, recipients:[invoice.customer], type:"PAYMENT_RECEIVED", title:"Payment Received", message:`Payment of ₹${Number(payment.amount || 0).toLocaleString("en-IN")} has been received for invoice ${invoice.invoiceNumber}.`, link:"/customer/billing", data:{ invoiceId:invoice._id, invoiceNumber:invoice.invoiceNumber, paymentId:payment._id, amount:payment.amount } })); } return ok(res,{payment,invoice},"Payment completed.");}catch(e){console.error(e);return fail(res,400,e.message||"Unable to complete payment.");}}
async function cancelPayment(req,res){try{if(!validId(req.params.id))return fail(res,400,"Invalid payment id.");const payment=await Payment.findById(req.params.id);if(!payment)return fail(res,404,"Payment not found.");if(payment.status!=="PENDING")return fail(res,409,"Only pending payments can be cancelled.");payment.status="CANCELLED";await payment.save();return ok(res,{payment},"Payment cancelled.");}catch(e){return fail(res,400,e.message);}}

async function createBudget(req,res){try{const b=req.body;if(n(b.allocatedAmount)<0||!b.startDate||!b.endDate)return fail(res,400,"Budget dates and allocated amount are required.");const start=new Date(b.startDate),end=new Date(b.endDate);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||start>end)return fail(res,400,"Invalid budget date range.");const doc=await Budget.create({budgetName:b.budgetName,category:b.category,period:b.period,startDate:start,endDate:end,allocatedAmount:n(b.allocatedAmount),notes:b.notes||"",createdBy:req.user._id});return res.status(201).json({success:true,message:"Budget created.",budget:doc});}catch(e){console.error(e);return fail(res,400,e.message||"Unable to create budget.");}}
async function listBudgets(req,res){try{const rows=await getBudgetsWithSpend();const q=String(req.query.search||"").toLowerCase();const filtered=q?rows.filter(b=>String(b.budgetName||"").toLowerCase().includes(q)||String(b.category||"").toLowerCase().includes(q)):rows;return ok(res,listResult(filtered.slice((paging(req.query).page-1)*paging(req.query).limit,paging(req.query).limit),filtered.length,paging(req.query).page,paging(req.query).limit));}catch(e){console.error(e);return fail(res,500,"Unable to load budgets.");}}
async function updateBudget(req,res){try{if(!validId(req.params.id))return fail(res,400,"Invalid budget id.");const b=await Budget.findById(req.params.id);if(!b)return fail(res,404,"Budget not found.");for(const k of ["budgetName","category","period","startDate","endDate","allocatedAmount","notes","status"])if(req.body[k]!==undefined)b[k]=req.body[k];await b.save();return ok(res,{budget:b},"Budget updated.");}catch(e){return fail(res,400,e.message);}}
async function deleteBudget(req,res){try{if(!validId(req.params.id))return fail(res,400,"Invalid budget id.");const b=await Budget.findById(req.params.id);if(!b)return fail(res,404,"Budget not found.");await b.deleteOne();return ok(res,{},"Budget deleted.");}catch(e){return fail(res,500,"Unable to delete budget.");}}

async function maintenanceCosts(req,res){try{const range=dateRange(req.query);const match=Object.keys(range).length?{completionDate:range}:{};const [rows,total,monthly,yearly]=await Promise.all([MaintenanceRecord.find(match).populate("vehicle","registrationNumber vehicleNumber vehicleType status").populate("workOrder","workOrderNumber").sort({completionDate:-1}).limit(100).lean(),sum(MaintenanceRecord,match,"totalCost"),sum(MaintenanceRecord,{completionDate:{$gte:new Date(new Date().getFullYear(),new Date().getMonth(),1)}},"totalCost"),sum(MaintenanceRecord,{completionDate:{$gte:new Date(new Date().getFullYear(),0,1)}},"totalCost")]);const grouped=await MaintenanceRecord.aggregate([{$match:match},{$group:{_id:"$vehicle",services:{$sum:1},totalCost:{$sum:"$totalCost"},lastService:{$max:"$completionDate"}}},{$sort:{totalCost:-1}}]);const ids=grouped.map(x=>x._id);const vehicles=await Vehicle.find({_id:{$in:ids}}).select("registrationNumber vehicleNumber vehicleType status").lean();const map=new Map(vehicles.map(v=>[v._id.toString(),v]));const byVehicle=grouped.map(g=>({vehicle:map.get(g._id.toString()),services:g.services,totalCost:g.totalCost,averageCost:g.services?g.totalCost/g.services:0,lastService:g.lastService}));return ok(res,{data:rows,summary:{total,monthly,yearly,vehiclesServiced:byVehicle.length,serviceCount:rows.length,averageServiceCost:rows.length?total/rows.length:0,byVehicle}});}catch(e){console.error(e);return fail(res,500,"Unable to load maintenance costs.");}}

async function report(req,res){const type=req.params.type;try{const range=dateRange(req.query);const result=await buildReport(type,range);return ok(res,{data:result});}catch(e){console.error("Finance report",e);return fail(res,400,e.message||"Unable to generate report.");}}
async function buildReport(type,range){
  const invoiceMatch={status:{$in:INVOICE_REVENUE_STATUSES}}; if(Object.keys(range).length) invoiceMatch.invoiceDate=range;
  if(type==="profit-loss"){const [revenue,fuel,maintenance,trip,driver,other]=await Promise.all([sum(Invoice,invoiceMatch,"totalAmount"),sumFuelExpenses(Object.keys(range).length?range:null),sum(MaintenanceRecord,Object.keys(range).length?{completionDate:range}: {},"totalCost"),sum(TripExpense,{...(Object.keys(range).length?{expenseDate:range}:{}),status:{$ne:"REJECTED"},category:{$ne:"FUEL"}}),sum(DriverExpense,{...(Object.keys(range).length?{expenseDate:range}:{}),status:{$ne:"REJECTED"}}),sum(Expense,{...(Object.keys(range).length?{expenseDate:range}:{}),category:{$nin:["FUEL","MAINTENANCE","TRIP","DRIVER_ALLOWANCE"]},status:{$ne:"REJECTED"}})]);const total=fuel+maintenance+trip+driver+other;return {revenue,fuel,maintenance,tripExpenses:trip,driverExpenses:driver,otherExpenses:other,totalExpenses:total,netProfit:revenue-total};}
  if(type==="fuel"){const match=Object.keys(range).length?{fuelDate:range}:{};const legacyMatch=Object.keys(range).length?{category:"FUEL",expenseDate:range}:{category:"FUEL"};const [native,legacy]=await Promise.all([FuelExpense.aggregate([{$match:match},{$group:{_id:"$vehicle",litres:{$sum:"$litres"},fuelCost:{$sum:"$totalAmount"},avgPrice:{$avg:"$pricePerLitre"}}}]),Expense.aggregate([{$match:legacyMatch},{$group:{_id:"$vehicle",litres:{$sum:{$ifNull:["$litres",0]}},fuelCost:{$sum:"$amount"}}}])]);const map=new Map();for(const row of [...native,...legacy]){const key=row._id?.toString()||"unknown";const current=map.get(key)||{_id:row._id,litres:0,fuelCost:0,weightedLitres:0};current.litres+=n(row.litres);current.fuelCost+=n(row.fuelCost);current.weightedLitres+=n(row.litres);map.set(key,current);}return [...map.values()].map(r=>({...r,avgPrice:r.litres?r.fuelCost/r.litres:0})).sort((a,b)=>b.fuelCost-a.fuelCost);}
  if(type==="maintenance"){const match=Object.keys(range).length?{completionDate:range}:{};return MaintenanceRecord.aggregate([{$match:match},{$group:{_id:"$vehicle",serviceCount:{$sum:1},totalCost:{$sum:"$totalCost"},averageCost:{$avg:"$totalCost"}}},{$sort:{totalCost:-1}}]);}
  if(type==="driver-expenses"){const match={status:{$ne:"REJECTED"}};if(Object.keys(range).length)match.expenseDate=range;return DriverExpense.aggregate([{$match:match},{$group:{_id:"$driver",tripCount:{$addToSet:"$trip"},total:{$sum:"$amount"},advances:{$sum:"$advanceAmount"},settled:{$sum:"$settledAmount"}}},{$project:{driver:"$_id",tripCount:{$size:"$tripCount"},total:1,advances:1,settled:1}}]);}
  if(type==="revenue"){return Invoice.aggregate([{$match:invoiceMatch},{$group:{_id:"$customer",invoiceCount:{$sum:1},revenue:{$sum:"$totalAmount"},received:{$sum:"$paidAmount"},outstanding:{$sum:"$balanceAmount"}}},{$sort:{revenue:-1}}]);}
  if(type==="payments"){const match={};if(Object.keys(range).length)match.paymentDate=range;return Payment.aggregate([{$match:match},{$group:{_id:"$type",total:{$sum:{$cond:[{$eq:["$status","COMPLETED"]},"$amount",0]}},count:{$sum:1}}}]);}
  if(type==="budgets")return getBudgetsWithSpend();
  if(type==="trip-profitability"){const trips=await Trip.find({}).populate("vehicle","registrationNumber vehicleNumber").populate("driver","fullName").populate("customer","fullName").lean();const ids=trips.map(t=>t._id);const inv=await Invoice.aggregate([{$match:{trip:{$in:ids},status:{$in:INVOICE_REVENUE_STATUSES}}},{$group:{_id:"$trip",revenue:{$sum:"$totalAmount"}}}]);const fuel=await FuelExpense.aggregate([{$match:{trip:{$in:ids}}},{$group:{_id:"$trip",cost:{$sum:"$totalAmount"}}}]);const te=await TripExpense.aggregate([{$match:{trip:{$in:ids},status:{$ne:"REJECTED"},category:{$ne:"FUEL"}}},{$group:{_id:"$trip",cost:{$sum:"$amount"}}}]);const de=await DriverExpense.aggregate([{$match:{trip:{$in:ids},status:{$ne:"REJECTED"},category:{$ne:"FUEL"}}},{$group:{_id:"$trip",cost:{$sum:"$amount"}}}]);const im=new Map(inv.map(x=>[x._id.toString(),x.revenue])),fm=new Map(fuel.map(x=>[x._id.toString(),x.cost])),tm=new Map(te.map(x=>[x._id.toString(),x.cost])),dm=new Map(de.map(x=>[x._id.toString(),x.cost]));return trips.map(t=>{const revenue=n(im.get(t._id.toString())),cost=n(fm.get(t._id.toString()))+n(tm.get(t._id.toString()))+n(dm.get(t._id.toString())),profit=revenue-cost;return {...t,revenue,cost,profit,margin:revenue?profit/revenue*100:null};});}
  if(type==="vehicle-profitability"){const vehicles=await Vehicle.find({}).lean();const [inv,fuel,maint,trip,driver,other]=await Promise.all([Invoice.aggregate([{$match:{status:{$in:INVOICE_REVENUE_STATUSES}}},{$lookup:{from:"trips",localField:"trip",foreignField:"_id",as:"t"}},{$unwind:"$t"},{$group:{_id:"$t.vehicle",value:{$sum:"$totalAmount"}}}]),FuelExpense.aggregate([{$group:{_id:"$vehicle",value:{$sum:"$totalAmount"}}}]),MaintenanceRecord.aggregate([{$group:{_id:"$vehicle",value:{$sum:"$totalCost"}}}]),TripExpense.aggregate([{$group:{_id:"$vehicle",value:{$sum:"$amount"}}}]),DriverExpense.aggregate([{$group:{_id:"$vehicle",value:{$sum:"$amount"}}}]),Expense.aggregate([{$match:{category:{$nin:["FUEL","MAINTENANCE","TRIP","DRIVER_ALLOWANCE"]},status:{$ne:"REJECTED"}}},{$group:{_id:"$vehicle",value:{$sum:"$amount"}}}])]);const maps=[inv,fuel,maint,trip,driver,other].map(rows=>new Map(rows.map(x=>[x._id?.toString(),n(x.value)])));return vehicles.map(v=>{const revenue=maps[0].get(v._id.toString())||0,cost=maps.slice(1).reduce((s,m)=>s+(m.get(v._id.toString())||0),0),profit=revenue-cost;return {...v,revenue,fuel:maps[1].get(v._id.toString())||0,maintenance:maps[2].get(v._id.toString())||0,tripExpenses:maps[3].get(v._id.toString())||0,driverExpenses:maps[4].get(v._id.toString())||0,otherExpenses:maps[5].get(v._id.toString())||0,totalCost:cost,profit,margin:revenue?profit/revenue*100:null};});}
  throw new Error("Unknown report type.");
}

async function financeOptions(req,res){
  try {
    const [vehicles, drivers, trips, customers] = await Promise.all([
      Vehicle.find({status: {$ne: "INACTIVE"}}).select("registrationNumber vehicleNumber vehicleType status").sort({registrationNumber:1}).lean(),
      User.find({role:"DRIVER", isActive:true, accountStatus:{$ne:"INACTIVE"}}).select("fullName email phone").sort({fullName:1}).lean(),
      Trip.find({}).select("tripId customer vehicle driver pickupLocation destination scheduledStart tripStatus distance").populate("customer","fullName email").populate("vehicle","registrationNumber vehicleNumber").populate("driver","fullName").sort({createdAt:-1}).limit(500).lean(),
      User.find({role:"CUSTOMER", isActive:true, accountStatus:{$ne:"INACTIVE"}}).select("fullName email phone").sort({fullName:1}).lean(),
    ]);
    return ok(res,{vehicles,drivers,trips,customers});
  } catch(e) { console.error("Finance options error:",e); return fail(res,500,"Unable to load finance reference data."); }
}

async function customerInvoices(req,res){try{const invoices=await Invoice.find({customer:req.user._id}).populate("trip","tripId pickupLocation destination scheduledStart").sort({invoiceDate:-1}).lean();return ok(res,{invoices});}catch(e){console.error(e);return fail(res,500,"Unable to load your invoices.");}}
async function myDriverExpenses(req,res){try{const rows=await DriverExpense.find({driver:req.user._id}).populate("trip","tripId").populate("vehicle","registrationNumber vehicleNumber").sort({expenseDate:-1}).lean();return ok(res,{expenses:rows});}catch(e){console.error(e);return fail(res,500,"Unable to load your expenses.");}}
async function financeProfile(req,res){try{const user=await User.findById(req.user._id).select("-password").lean();return ok(res,{user});}catch(e){return fail(res,500,"Unable to load profile.");}}
async function updateFinanceProfile(req,res){try{const user=await User.findById(req.user._id);if(!user)return fail(res,404,"User not found.");if(req.body.fullName!==undefined){if(String(req.body.fullName).trim().length<2)return fail(res,400,"Full name must be at least 2 characters.");user.fullName=String(req.body.fullName).trim();}if(req.body.phone!==undefined)user.phone=String(req.body.phone||"").trim()||null;await user.save();const safe=await User.findById(user._id).select("-password").lean();return ok(res,{user:safe},"Profile updated successfully.");}catch(e){return fail(res,400,"Unable to update profile.");}}

module.exports={dashboard,createExpense,listExpenses:(req,res)=>listModel(Expense,req,res,{label:"expenses",key:"expenses",searchFields:["expenseNumber","description","category","vendor"],dateField:"expenseDate",populate:[["vehicle","registrationNumber vehicleNumber"],["driver","fullName"],["trip","tripId"]]}),getExpense:(req,res)=>getOne(Expense,req,res,"expense",[["vehicle","registrationNumber vehicleNumber"],["driver","fullName"],["trip","tripId"]]),updateExpense:(req,res)=>updateSimple(Expense,req,res,{key:"expense",lockStatus:true}),deleteExpense:(req,res)=>remove(Expense,req,res),approveExpense:(req,res)=>action(Expense,req,res,"approve"),rejectExpense:(req,res)=>action(Expense,req,res,"reject"),payExpense:(req,res)=>action(Expense,req,res,"pay"),createFuel,listFuel,getFuel:(req,res)=>getOne(FuelExpense,req,res,"fuel",[["vehicle","registrationNumber vehicleNumber"],["driver","fullName"],["trip","tripId"]]),updateFuel:(req,res)=>updateSimple(FuelExpense,req,res,{key:"fuel"}),deleteFuel:(req,res)=>remove(FuelExpense,req,res),maintenanceCosts,createTripExpense,listTripExpenses:async(req,res)=>{try{const filter=buildListFilter(req.query,["expenseNumber","description","category","vendor"],"expenseDate");const {page,limit,skip}=paging(req.query);const summaryMatch={...filter,status:{$ne:"REJECTED"}};const [data,total,summary]=await Promise.all([TripExpense.find(filter).populate([["trip","tripId pickupLocation destination"],["vehicle","registrationNumber vehicleNumber"],["driver","fullName"]]).sort({expenseDate:-1}).skip(skip).limit(limit).lean(),TripExpense.countDocuments(filter),TripExpense.aggregate([{$match:summaryMatch},{$group:{_id:"$trip",expenseCount:{$sum:1},totalAmount:{$sum:"$amount"},paidAmount:{$sum:{$cond:[{$eq:["$status","PAID"]},"$amount",0]}}}},{$sort:{totalAmount:-1}}])]);const summaryIds=summary.map(x=>x._id).filter(Boolean);const trips=summaryIds.length?await Trip.find({_id:{$in:summaryIds}}).populate([["vehicle","registrationNumber vehicleNumber"],["driver","fullName"]]).select("tripId pickupLocation destination vehicle driver").lean():[];const tripMap=new Map(trips.map(x=>[x._id.toString(),x]));const tripSummaries=summary.map(x=>{const trip=tripMap.get(x._id?.toString());const totalAmount=Number(x.totalAmount||0),paidAmount=Number(x.paidAmount||0);return{tripId:trip?.tripId||"—",trip:x._id,vehicle:trip?.vehicle||null,driver:trip?.driver||null,pickupLocation:trip?.pickupLocation||"—",destination:trip?.destination||"—",expenseCount:Number(x.expenseCount||0),totalAmount,paidAmount,outstandingAmount:Math.max(0,totalAmount-paidAmount),paymentStatus:paidAmount<=0?"UNPAID":paidAmount>=totalAmount?"PAID":"PARTIALLY_PAID"};});const summaryMap=new Map(summary.map(x=>[x._id?.toString(),x]));const rows=data.map(x=>{const s=summaryMap.get(x.trip?._id?.toString()||x.trip?.toString())||{totalAmount:0,paidAmount:0};const totalAmount=Number(s.totalAmount||0),paidAmount=Number(s.paidAmount||0);return {...x,tripTotalAmount:totalAmount,tripPaidAmount:paidAmount,tripPaymentStatus:paidAmount<=0?"UNPAID":paidAmount>=totalAmount?"PAID":"PARTIALLY_PAID"};});return ok(res,{...listResult(rows,total,page,limit),tripSummaries});}catch(e){console.error("Trip expenses list error",e);return fail(res,500,"Unable to load trip expenses.");}},getTripExpense:(req,res)=>getOne(TripExpense,req,res,"expense",[["trip","tripId"],["vehicle","registrationNumber vehicleNumber"],["driver","fullName"]]),updateTripExpense:(req,res)=>updateSimple(TripExpense,req,res,{key:"expense",lockStatus:true}),deleteTripExpense:(req,res)=>remove(TripExpense,req,res),approveTripExpense:(req,res)=>action(TripExpense,req,res,"approve"),rejectTripExpense:(req,res)=>action(TripExpense,req,res,"reject"),payTripExpense:(req,res)=>action(TripExpense,req,res,"pay"),createDriverExpense,listDriverExpenses:async(req,res)=>{try{const filter=buildListFilter(req.query,["expenseNumber","category","description"],"expenseDate");const {page,limit,skip}=paging(req.query);const [data,total,summary]=await Promise.all([DriverExpense.find(filter).populate([["driver","fullName"],["trip","tripId"],["vehicle","registrationNumber vehicleNumber"]]).sort({expenseDate:-1}).skip(skip).limit(limit).lean(),DriverExpense.countDocuments(filter),DriverExpense.aggregate([{$match:{...filter,status:{$ne:"REJECTED"}}},{$group:{_id:"$driver",totalAmount:{$sum:"$amount"},paidAmount:{$sum:{$cond:[{$in:["$status",["PAID","SETTLED"]]},"$amount",0]}}}}])]);const summaryMap=new Map(summary.map(x=>[x._id?.toString(),x]));const rows=data.map(x=>{const s=summaryMap.get(x.driver?._id?.toString()||x.driver?.toString())||{totalAmount:0,paidAmount:0};return {...x,driverTotalAmount:Number(s.totalAmount||0),driverPaidAmount:Number(s.paidAmount||0)};});return ok(res,listResult(rows,total,page,limit));}catch(e){console.error("Driver expenses list error",e);return fail(res,500,"Unable to load driver expenses.");}},getDriverExpense:(req,res)=>getOne(DriverExpense,req,res,"expense",[["driver","fullName"],["trip","tripId"],["vehicle","registrationNumber vehicleNumber"]]),updateDriverExpense:(req,res)=>updateSimple(DriverExpense,req,res,{key:"expense",lockStatus:true}),deleteDriverExpense:(req,res)=>remove(DriverExpense,req,res),approveDriverExpense:(req,res)=>action(DriverExpense,req,res,"approve"),rejectDriverExpense:(req,res)=>action(DriverExpense,req,res,"reject"),payDriverExpense:(req,res)=>action(DriverExpense,req,res,"pay"),settleDriverExpense:(req,res)=>action(DriverExpense,req,res,"settle"),createInvoice,listInvoices:(req,res)=>listModel(Invoice,req,res,{label:"invoices",key:"invoices",searchFields:["invoiceNumber","status"],dateField:"invoiceDate",populate:[["customer","fullName email"],["trip","tripId pickupLocation destination"]]}),getInvoice:(req,res)=>getOne(Invoice,req,res,"invoice",[["customer","fullName email"],["trip","tripId pickupLocation destination"]]),updateInvoice:invoiceUpdate,deleteInvoice:async(req,res)=>remove(Invoice,req,res),issueInvoice,cancelInvoice,createPayment,listPayments:(req,res)=>listModel(Payment,req,res,{label:"payments",key:"payments",searchFields:["paymentNumber","referenceNumber","type","status"],dateField:"paymentDate",populate:[["invoice","invoiceNumber"],["customer","fullName"],["expense","expenseNumber"]]}),getPayment:(req,res)=>getOne(Payment,req,res,"payment",[["invoice","invoiceNumber"],["customer","fullName"],["expense","expenseNumber"]]),updatePayment:(req,res)=>updateSimple(Payment,req,res,{key:"payment",lockStatus:true}),completePayment,cancelPayment,createBudget,listBudgets,getBudget:async(req,res)=>getOne(Budget,req,res,"budget"),updateBudget,deleteBudget,report,customerInvoices,myDriverExpenses,financeProfile,updateFinanceProfile,financeOptions};

async function getOne(Model,req,res,key,populate=[]){try{if(!validId(req.params.id))return fail(res,400,"Invalid record id.");let q=Model.findById(req.params.id);for(const [path,select] of populate)q=q.populate(path,select);const doc=await q.lean();if(!doc)return fail(res,404,"Record not found.");return ok(res,{[key]:doc});}catch(e){console.error(e);return fail(res,500,"Unable to load record.");}}
