const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generatePONumber } = require('../utils/identifiers');

function normalizePurchaseOrderStatuses(po) {
    if (!po) return po;
    const statusMapping = {
        'On Hold': 'Hold'
    };
    const deliveryMapping = {
        'Not Delivered': 'Not Received',
        'Partially Delivered': 'Partially Received',
        'Delivered': 'Received Delivery'
    };

    if (po.status && statusMapping[po.status]) {
        po.status = statusMapping[po.status];
    }

    if (po.delivery_status && deliveryMapping[po.delivery_status]) {
        po.delivery_status = deliveryMapping[po.delivery_status];
    }

    return po;
}

// Create Purchase Order (Logistics only)
router.post('/', requireAuth, requireRole('Logistics'), async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { vendorName, description, items } = req.body;
        const orgId = req.session.orgId;
        const userId = req.session.userId;

        // Validation
        if (!vendorName || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ 
                error: 'Invalid data',
                message: 'Please provide vendor name and at least one item' 
            });
        }

        // Calculate total amount
        let totalAmount = 0;
        for (const item of items) {
            if (!item.itemName || !item.quantity || !item.unitPrice) {
                await connection.rollback();
                return res.status(400).json({ 
                    error: 'Invalid item data',
                    message: 'Each item must have name, quantity, and unit price' 
                });
            }
            totalAmount += item.quantity * item.unitPrice;
        }

        // Generate PO number
        const poNumber = generatePONumber(orgId);

        // Insert purchase order
        const [poResult] = await connection.query(
            `INSERT INTO purchase_orders 
            (org_id, po_number, created_by_user_id, vendor_name, total_amount, description, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [orgId, poNumber, userId, vendorName, totalAmount, description, 'Pending']
        );

        const poId = poResult.insertId;

        // Insert items
        for (const item of items) {
            const totalPrice = item.quantity * item.unitPrice;
            await connection.query(
                `INSERT INTO po_items (po_id, item_name, quantity, unit_price, total_price) 
                VALUES (?, ?, ?, ?, ?)`,
                [poId, item.itemName, item.quantity, item.unitPrice, totalPrice]
            );
        }

        // Log the action
        await connection.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, userId, 'PO_CREATED', 'purchase_order', poId, JSON.stringify({ poNumber, vendorName, totalAmount })]
        );

        await connection.commit();

        res.status(201).json({ 
            success: true,
            message: 'Purchase order created successfully',
            poId,
            poNumber
        });

    } catch (error) {
        await connection.rollback();
        console.error('Create PO error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to create purchase order' 
        });
    } finally {
        connection.release();
    }
});

// Get all POs for the user's organization (filtered by role)
router.get('/', requireAuth, async (req, res) => {
    try {
        const orgId = req.session.orgId;
        const role = req.session.role;
        const userId = req.session.userId;

        let query = `
            SELECT 
                po.id,
                po.po_number,
                po.vendor_name,
                po.total_amount,
                po.description,
                po.status,
                po.payment_status,
                po.delivery_status,
                po.created_at,
                po.updated_at,
                creator.full_name as created_by,
                reviewer.full_name as reviewed_by
            FROM purchase_orders po
            LEFT JOIN users creator ON po.created_by_user_id = creator.id
            LEFT JOIN users reviewer ON po.reviewed_by_user_id = reviewer.id
            WHERE po.org_id = ?
        `;

        const params = [orgId];

        // Role-based filtering
        if (role === 'Logistics') {
            // Logistics can see POs they created or those generated from requests they handled
            query += ` AND (po.created_by_user_id = ? OR EXISTS (
                SELECT 1 FROM procurement_requests pr
                WHERE pr.po_id = po.id AND pr.logistics_submitted_by_user_id = ?
            ))`;
            params.push(userId, userId);
        } else if (role === 'Finance') {
            // Finance can only see approved POs
            query += ' AND po.status = ?';
            params.push('Approved');
        } else if (role === 'Stores') {
            // Stores role can only see approved POs
            query += ' AND po.status = ?';
            params.push('Approved');
        }
        // Head of Department and Admin can see all POs

        query += ' ORDER BY po.created_at DESC';

        const [pos] = await db.query(query, params);
        const normalizedPos = pos.map(normalizePurchaseOrderStatuses);

        res.json({ 
            success: true,
            purchaseOrders: normalizedPos
        });

    } catch (error) {
        console.error('Get POs error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to retrieve purchase orders' 
        });
    }
});

// Get single PO with items
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const poId = req.params.id;
        const orgId = req.session.orgId;
        const role = req.session.role;
        const userId = req.session.userId;

        // Get PO details
        const [pos] = await db.query(
            `SELECT 
                po.*,
                creator.full_name as created_by,
                creator.email as created_by_email,
                reviewer.full_name as reviewed_by
            FROM purchase_orders po
            LEFT JOIN users creator ON po.created_by_user_id = creator.id
            LEFT JOIN users reviewer ON po.reviewed_by_user_id = reviewer.id
            WHERE po.id = ? AND po.org_id = ?`,
            [poId, orgId]
        );

        if (pos.length === 0) {
            return res.status(404).json({ 
                error: 'Not found',
                message: 'Purchase order not found' 
            });
        }

        const po = normalizePurchaseOrderStatuses(pos[0]);

        // Role-based access control
        if (role === 'Logistics' && po.created_by_user_id !== userId) {
            return res.status(403).json({ 
                error: 'Forbidden',
                message: 'You can only view your own purchase orders' 
            });
        }

        if ((role === 'Finance' || role === 'Stores') && po.status !== 'Approved') {
            return res.status(403).json({ 
                error: 'Forbidden',
                message: 'You can only view approved purchase orders' 
            });
        }

        // Get items
        const [items] = await db.query(
            'SELECT * FROM po_items WHERE po_id = ?',
            [poId]
        );

        res.json({ 
            success: true,
            purchaseOrder: po,
            items: items
        });

    } catch (error) {
        console.error('Get PO error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to retrieve purchase order' 
        });
    }
});

// Review PO - Approve/Reject/Hold (Head of Department only)
router.patch('/:id/review', requireAuth, requireRole('Head of Department'), async (req, res) => {
    try {
        const poId = req.params.id;
        const { status, notes } = req.body;
        const orgId = req.session.orgId;
        const userId = req.session.userId;

        // Validate status
        if (!['Approved', 'Rejected', 'Hold'].includes(status)) {
            return res.status(400).json({ 
                error: 'Invalid status',
                message: 'Status must be Approved, Rejected, or Hold' 
            });
        }

        // Verify PO exists and belongs to org
        const [pos] = await db.query(
            'SELECT id, status FROM purchase_orders WHERE id = ? AND org_id = ?',
            [poId, orgId]
        );

        if (pos.length === 0) {
            return res.status(404).json({ 
                error: 'Not found',
                message: 'Purchase order not found' 
            });
        }

        if (pos[0].status !== 'Pending') {
            return res.status(400).json({ 
                error: 'Invalid operation',
                message: 'Only pending purchase orders can be reviewed' 
            });
        }

        // Update PO
        await db.query(
            'UPDATE purchase_orders SET status = ?, reviewed_by_user_id = ?, reviewed_at = NOW() WHERE id = ?',
            [status, userId, poId]
        );

        // Log the action
        await db.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, userId, 'PO_REVIEWED', 'purchase_order', poId, JSON.stringify({ status, notes })]
        );

        res.json({ 
            success: true,
            message: `Purchase order ${status.toLowerCase()} successfully`
        });

    } catch (error) {
        console.error('Review PO error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to review purchase order' 
        });
    }
});

// Update payment status (Finance only)
router.patch('/:id/payment', requireAuth, requireRole('Finance'), async (req, res) => {
    try {
        const poId = req.params.id;
        const { paymentStatus, notes } = req.body;
        const orgId = req.session.orgId;
        const userId = req.session.userId;

        // Validate payment status
        if (!['Not Paid', 'Partially Paid', 'Paid'].includes(paymentStatus)) {
            return res.status(400).json({ 
                error: 'Invalid status',
                message: 'Payment status must be Not Paid, Partially Paid, or Paid' 
            });
        }

        // Verify PO exists, belongs to org, and is approved
        const [pos] = await db.query(
            'SELECT id, status, payment_status FROM purchase_orders WHERE id = ? AND org_id = ?',
            [poId, orgId]
        );

        if (pos.length === 0) {
            return res.status(404).json({ 
                error: 'Not found',
                message: 'Purchase order not found' 
            });
        }

        if (pos[0].status !== 'Approved') {
            return res.status(400).json({ 
                error: 'Invalid operation',
                message: 'Only approved purchase orders can have payment status updated' 
            });
        }

        const oldStatus = pos[0].payment_status;

        // Update payment status
        await db.query(
            'UPDATE purchase_orders SET payment_status = ? WHERE id = ?',
            [paymentStatus, poId]
        );

        // Log payment update
        await db.query(
            'INSERT INTO payment_updates (po_id, updated_by_user_id, old_status, new_status, notes) VALUES (?, ?, ?, ?, ?)',
            [poId, userId, oldStatus, paymentStatus, notes]
        );

        // Log the action
        await db.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, userId, 'PAYMENT_UPDATED', 'purchase_order', poId, JSON.stringify({ oldStatus, newStatus: paymentStatus, notes })]
        );

        res.json({ 
            success: true,
            message: 'Payment status updated successfully'
        });

    } catch (error) {
        console.error('Update payment error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to update payment status' 
        });
    }
});

// Update delivery status (Stores role only)
router.patch('/:id/delivery', requireAuth, requireRole('Stores'), async (req, res) => {
    try {
        const poId = req.params.id;
        const { deliveryStatus, notes } = req.body;
        const orgId = req.session.orgId;
        const userId = req.session.userId;

        // Validate delivery status
        if (!['Not Received', 'Partially Received', 'Received Delivery'].includes(deliveryStatus)) {
            return res.status(400).json({ 
                error: 'Invalid status',
                message: 'Delivery status must be Not Received, Partially Received, or Received Delivery' 
            });
        }

        // Verify PO exists, belongs to org, and is approved
        const [pos] = await db.query(
            'SELECT id, status, payment_status, delivery_status FROM purchase_orders WHERE id = ? AND org_id = ?',
            [poId, orgId]
        );

        if (pos.length === 0) {
            return res.status(404).json({ 
                error: 'Not found',
                message: 'Purchase order not found' 
            });
        }

        if (pos[0].status !== 'Approved') {
            return res.status(400).json({ 
                error: 'Invalid operation',
                message: 'Only approved purchase orders can have delivery status updated' 
            });
        }

        if (!['Paid', 'Partially Paid'].includes(pos[0].payment_status)) {
            return res.status(400).json({ 
                error: 'Invalid dependency',
                message: 'Finance must mark the purchase order as paid or partially paid before updating delivery status' 
            });
        }

        const oldStatus = pos[0].delivery_status;

        // Update delivery status
        await db.query(
            'UPDATE purchase_orders SET delivery_status = ? WHERE id = ?',
            [deliveryStatus, poId]
        );

        // Log delivery update
        await db.query(
            'INSERT INTO delivery_updates (po_id, updated_by_user_id, old_status, new_status, notes) VALUES (?, ?, ?, ?, ?)',
            [poId, userId, oldStatus, deliveryStatus, notes]
        );

        // Log the action
        await db.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, userId, 'DELIVERY_UPDATED', 'purchase_order', poId, JSON.stringify({ oldStatus, newStatus: deliveryStatus, notes })]
        );

        res.json({ 
            success: true,
            message: 'Delivery status updated successfully'
        });

    } catch (error) {
        console.error('Update delivery error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to update delivery status' 
        });
    }
});

module.exports = router;
