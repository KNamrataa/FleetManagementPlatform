const express = require("express");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const c = require("../controllers/financeController");

const router = express.Router();
const finance = [authenticate, authorize("FINANCE_MANAGER")];
router.get("/dashboard", ...finance, c.dashboard);
router.get("/options", ...finance, c.financeOptions);
router.post("/expenses", ...finance, c.createExpense);
router.get("/expenses", ...finance, c.listExpenses);
router.get("/expenses/:id", ...finance, c.getExpense);
router.put("/expenses/:id", ...finance, c.updateExpense);
router.delete("/expenses/:id", ...finance, c.deleteExpense);
router.patch("/expenses/:id/approve", ...finance, c.approveExpense);
router.patch("/expenses/:id/reject", ...finance, c.rejectExpense);
router.patch("/expenses/:id/pay", ...finance, c.payExpense);

router.post("/fuel", ...finance, c.createFuel);
router.get("/fuel", ...finance, c.listFuel);
router.get("/fuel/:id", ...finance, c.getFuel);
router.put("/fuel/:id", ...finance, c.updateFuel);
router.delete("/fuel/:id", ...finance, c.deleteFuel);

router.get("/maintenance-costs", ...finance, c.maintenanceCosts);

router.post("/trip-expenses", ...finance, c.createTripExpense);
router.get("/trip-expenses", ...finance, c.listTripExpenses);
router.get("/trip-expenses/:id", ...finance, c.getTripExpense);
router.put("/trip-expenses/:id", ...finance, c.updateTripExpense);
router.delete("/trip-expenses/:id", ...finance, c.deleteTripExpense);
router.patch("/trip-expenses/:id/approve", ...finance, c.approveTripExpense);
router.patch("/trip-expenses/:id/reject", ...finance, c.rejectTripExpense);
router.patch("/trip-expenses/:id/pay", ...finance, c.payTripExpense);

router.post("/driver-expenses", ...finance, c.createDriverExpense);
router.get("/driver-expenses", ...finance, c.listDriverExpenses);
router.get("/driver-expenses/:id", ...finance, c.getDriverExpense);
router.put("/driver-expenses/:id", ...finance, c.updateDriverExpense);
router.delete("/driver-expenses/:id", ...finance, c.deleteDriverExpense);
router.patch("/driver-expenses/:id/approve", ...finance, c.approveDriverExpense);
router.patch("/driver-expenses/:id/reject", ...finance, c.rejectDriverExpense);
router.patch("/driver-expenses/:id/pay", ...finance, c.payDriverExpense);
router.patch("/driver-expenses/:id/settle", ...finance, c.settleDriverExpense);

router.post("/invoices", ...finance, c.createInvoice);
router.get("/invoices", ...finance, c.listInvoices);
router.get("/invoices/:id", ...finance, c.getInvoice);
router.put("/invoices/:id", ...finance, c.updateInvoice);
router.delete("/invoices/:id", ...finance, c.deleteInvoice);
router.patch("/invoices/:id/issue", ...finance, c.issueInvoice);
router.patch("/invoices/:id/cancel", ...finance, c.cancelInvoice);

router.post("/payments", ...finance, c.createPayment);
router.get("/payments", ...finance, c.listPayments);
router.get("/payments/:id", ...finance, c.getPayment);
router.put("/payments/:id", ...finance, c.updatePayment);
router.patch("/payments/:id/complete", ...finance, c.completePayment);
router.patch("/payments/:id/cancel", ...finance, c.cancelPayment);

router.post("/budgets", ...finance, c.createBudget);
router.get("/budgets", ...finance, c.listBudgets);
router.get("/budgets/:id", ...finance, c.getBudget);
router.put("/budgets/:id", ...finance, c.updateBudget);
router.delete("/budgets/:id", ...finance, c.deleteBudget);

router.get("/reports/:type", ...finance, c.report);

router.get("/customer/invoices", authenticate, authorize("CUSTOMER"), c.customerInvoices);
router.get("/driver/my-expenses", authenticate, authorize("DRIVER"), c.myDriverExpenses);
router.get("/profile", ...finance, c.financeProfile);
router.put("/profile", ...finance, c.updateFinanceProfile);

module.exports = router;
