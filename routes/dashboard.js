const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const PROCUREMENT_STATUSES = [
    'Pending Admin Review',
    'Admin Approved',
    'Admin Hold',
    'Admin Rejected',
    'Vendors Submitted',
    'PO Created'
];

function buildProcurementStats(rows) {
    const base = {
        total: 0,
        pendingAdminReview: 0,
        adminApproved: 0,
        adminHold: 0,
        adminRejected: 0,
        vendorsSubmitted: 0,
        poCreated: 0
    };

    for (const row of rows) {
        const status = row.status;
        const count = Number(row.count) || 0;
        base.total += count;

        switch (status) {
            case 'Pending Admin Review':
                base.pendingAdminReview = count;
                break;
            case 'Admin Approved':
                base.adminApproved = count;
                break;
            case 'Admin Hold':
                base.adminHold = count;
                break;
            case 'Admin Rejected':
                base.adminRejected = count;
                break;
            case 'Vendors Submitted':
                base.vendorsSubmitted = count;
                break;
            case 'PO Created':
                base.poCreated = count;
                break;
            default:
                break;
        }
    }

    return base;
}

// Get dashboard statistics
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const orgId = req.session.orgId;
        const role = req.session.role;
        const userId = req.session.userId;

        const stats = {};

        // Total POs (filtered by role)
        let query = 'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ?';
        let params = [orgId];

        if (role === 'Logistics') {
            query += ' AND created_by_user_id = ?';
            params.push(userId);
        } else if (role === 'Finance' || role === 'Stores') {
            query += ' AND status = ?';
            params.push('Approved');
        }

        const [totalResult] = await db.query(query, params);
        stats.total = totalResult[0].count;

        // Status breakdown
        if (role === 'Logistics') {
            const [pending] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND created_by_user_id = ? AND status = ?',
                [orgId, userId, 'Pending']
            );
            const [approved] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND created_by_user_id = ? AND status = ?',
                [orgId, userId, 'Approved']
            );
            const [rejected] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND created_by_user_id = ? AND status = ?',
                [orgId, userId, 'Rejected']
            );
            const [onHold] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND created_by_user_id = ? AND status IN (?, ?)',
                [orgId, userId, 'Hold', 'On Hold']
            );

            stats.pending = pending[0].count;
            stats.approved = approved[0].count;
            stats.rejected = rejected[0].count;
            stats.hold = onHold[0].count;

        } else if (role === 'Head of Department' || role === 'Admin') {
            const [pending] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND status = ?',
                [orgId, 'Pending']
            );
            const [approved] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND status = ?',
                [orgId, 'Approved']
            );
            const [rejected] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND status = ?',
                [orgId, 'Rejected']
            );
            const [onHold] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND status IN (?, ?)',
                [orgId, 'Hold', 'On Hold']
            );

            stats.pending = pending[0].count;
            stats.approved = approved[0].count;
            stats.rejected = rejected[0].count;
            stats.hold = onHold[0].count;

        } else if (role === 'Finance') {
            const [notPaid] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND status = ? AND payment_status = ?',
                [orgId, 'Approved', 'Not Paid']
            );
            const [partiallyPaid] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND status = ? AND payment_status = ?',
                [orgId, 'Approved', 'Partially Paid']
            );
            const [paid] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND status = ? AND payment_status = ?',
                [orgId, 'Approved', 'Paid']
            );

            stats.notPaid = notPaid[0].count;
            stats.partiallyPaid = partiallyPaid[0].count;
            stats.paid = paid[0].count;

        } else if (role === 'Stores') {
            const [notReceived] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND status = ? AND delivery_status IN (?, ?)',
                [orgId, 'Approved', 'Not Received', 'Not Delivered']
            );
            const [partiallyReceived] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND status = ? AND delivery_status IN (?, ?)',
                [orgId, 'Approved', 'Partially Received', 'Partially Delivered']
            );
            const [receivedDelivery] = await db.query(
                'SELECT COUNT(*) as count FROM purchase_orders WHERE org_id = ? AND status = ? AND delivery_status IN (?, ?)',
                [orgId, 'Approved', 'Received Delivery', 'Delivered']
            );

            stats.notReceived = notReceived[0].count;
            stats.partiallyReceived = partiallyReceived[0].count;
            stats.receivedDelivery = receivedDelivery[0].count;
        }

        // Total amount
        let amountQuery = 'SELECT SUM(total_amount) as total FROM purchase_orders WHERE org_id = ?';
        let amountParams = [orgId];

        if (role === 'Logistics') {
            amountQuery += ' AND created_by_user_id = ?';
            amountParams.push(userId);
        } else if (role === 'Finance' || role === 'Stores') {
            amountQuery += ' AND status = ?';
            amountParams.push('Approved');
        }

        const [amountResult] = await db.query(amountQuery, amountParams);
        stats.totalAmount = amountResult[0].total || 0;

        if (['Head of Department', 'Admin', 'Logistics'].includes(role)) {
            let procurementQuery = 'SELECT status, COUNT(*) as count FROM procurement_requests WHERE org_id = ?';
            const procurementParams = [orgId];

            if (role === 'Head of Department') {
                procurementQuery += ' AND requested_by_user_id = ?';
                procurementParams.push(userId);
            } else if (role === 'Logistics') {
                procurementQuery += ' AND status IN (?, ?)';
                procurementParams.push('Admin Approved', 'Vendors Submitted');
            }

            procurementQuery += ' GROUP BY status';

            const [procurementRows] = await db.query(procurementQuery, procurementParams);
            stats.procurementRequests = buildProcurementStats(procurementRows);
        }

        res.json({ 
            success: true,
            stats
        });

    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to retrieve dashboard statistics' 
        });
    }
});

module.exports = router;
