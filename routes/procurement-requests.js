const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateProcurementRequestNumber, generatePONumber } = require('../utils/identifiers');

const REQUEST_STATUS = {
    PENDING_ADMIN_REVIEW: 'Pending Admin Review',
    ADMIN_APPROVED: 'Admin Approved',
    ADMIN_REJECTED: 'Admin Rejected',
    ADMIN_HOLD: 'Admin Hold',
    VENDORS_SUBMITTED: 'Vendors Submitted',
    PO_CREATED: 'PO Created'
};

const ADMIN_DECISION = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    HOLD: 'Hold'
};

function parseNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function buildRequestResponse(rows, itemsByRequest, vendorOptionsByRequest) {
    return rows.map(row => {
        const requestItems = itemsByRequest.get(row.id) || [];
        const vendorOptions = vendorOptionsByRequest.get(row.id) || [];

        return {
            id: row.id,
            orgId: row.org_id,
            requestNumber: row.request_number,
            title: row.title,
            overallReason: row.overall_reason,
            status: row.status,
            adminDecision: row.admin_decision,
            adminNotes: row.admin_notes,
            adminReviewedAt: row.admin_reviewed_at,
            logisticsSubmittedAt: row.logistics_submitted_at,
            selectedVendorOptionId: row.selected_vendor_option_id,
            poId: row.po_id,
            poNumber: row.po_number,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            requestedBy: {
                id: row.requested_by_user_id,
                name: row.requested_by_name,
                email: row.requested_by_email
            },
            adminReviewer: row.admin_reviewer_id ? {
                id: row.admin_reviewer_id,
                name: row.admin_reviewer_name,
                email: row.admin_reviewer_email
            } : null,
            logisticsSubmitter: row.logistics_submitter_id ? {
                id: row.logistics_submitter_id,
                name: row.logistics_submitter_name,
                email: row.logistics_submitter_email
            } : null,
            items: requestItems,
            vendorOptions
        };
    });
}

async function fetchRequestCollections(orgId, role, userId) {
    let baseQuery = `
        SELECT 
            pr.*,
            po.po_number AS po_number,
            requester.full_name AS requested_by_name,
            requester.email AS requested_by_email,
            admin.full_name AS admin_reviewer_name,
            admin.email AS admin_reviewer_email,
            admin.id AS admin_reviewer_id,
            logistics.full_name AS logistics_submitter_name,
            logistics.email AS logistics_submitter_email,
            logistics.id AS logistics_submitter_id
        FROM procurement_requests pr
        INNER JOIN users requester ON pr.requested_by_user_id = requester.id
        LEFT JOIN users admin ON pr.admin_reviewed_by_user_id = admin.id
        LEFT JOIN users logistics ON pr.logistics_submitted_by_user_id = logistics.id
        LEFT JOIN purchase_orders po ON pr.po_id = po.id
        WHERE pr.org_id = ?
    `;
    const params = [orgId];

    if (role === 'Head of Department') {
        baseQuery += ' AND pr.requested_by_user_id = ?';
        params.push(userId);
    } else if (role === 'Logistics') {
        baseQuery += ' AND pr.status IN (?, ?)';
        params.push(REQUEST_STATUS.ADMIN_APPROVED, REQUEST_STATUS.VENDORS_SUBMITTED);
    } else if (role === 'Finance' || role === 'Stores') {
        baseQuery += ' AND pr.status = ?';
        params.push(REQUEST_STATUS.PO_CREATED);
    }

    baseQuery += ' ORDER BY pr.created_at DESC';

    const [requestsRows] = await db.query(baseQuery, params);
    const requestIds = requestsRows.map(row => row.id);

    const itemsByRequest = new Map();
    const vendorOptionsByRequest = new Map();

    if (requestIds.length === 0) {
        return [];
    }

    const [itemsRows] = await db.query(
        `SELECT pri.id, pri.request_id, pri.item_name, pri.quantity, pri.justification, pri.created_at
         FROM procurement_request_items pri
         WHERE pri.request_id IN (?)
         ORDER BY pri.id ASC`,
        [requestIds]
    );

    for (const item of itemsRows) {
        const existing = itemsByRequest.get(item.request_id) || [];
        existing.push({
            id: item.id,
            itemName: item.item_name,
            quantity: item.quantity,
            justification: item.justification,
            createdAt: item.created_at
        });
        itemsByRequest.set(item.request_id, existing);
    }

    const [vendorOptionRows] = await db.query(
        `SELECT pvo.id, pvo.request_id, pvo.vendor_name, pvo.total_price, pvo.notes, pvo.created_at,
                submitter.full_name AS submitted_by_name,
                submitter.email AS submitted_by_email,
                submitter.id AS submitted_by_id
         FROM procurement_vendor_options pvo
         LEFT JOIN users submitter ON pvo.submitted_by_user_id = submitter.id
         WHERE pvo.request_id IN (?)
         ORDER BY pvo.created_at ASC`,
        [requestIds]
    );

    const vendorOptionIds = vendorOptionRows.map(row => row.id);
    const vendorOptionItemsByOption = new Map();

    if (vendorOptionIds.length > 0) {
        const [vendorOptionItemsRows] = await db.query(
            `SELECT pvoi.vendor_option_id, pvoi.request_item_id, pvoi.unit_price, pvoi.total_price,
                    pri.item_name, pri.quantity
             FROM procurement_vendor_option_items pvoi
             INNER JOIN procurement_request_items pri ON pvoi.request_item_id = pri.id
             WHERE pvoi.vendor_option_id IN (?)
             ORDER BY pri.id ASC`,
            [vendorOptionIds]
        );

        for (const item of vendorOptionItemsRows) {
            const existing = vendorOptionItemsByOption.get(item.vendor_option_id) || [];
            existing.push({
                requestItemId: item.request_item_id,
                itemName: item.item_name,
                quantity: item.quantity,
                unitPrice: Number(item.unit_price),
                totalPrice: Number(item.total_price)
            });
            vendorOptionItemsByOption.set(item.vendor_option_id, existing);
        }
    }

    for (const option of vendorOptionRows) {
        const requestId = option.request_id;
        const existing = vendorOptionsByRequest.get(requestId) || [];
        existing.push({
            id: option.id,
            vendorName: option.vendor_name,
            totalPrice: Number(option.total_price),
            notes: option.notes,
            createdAt: option.created_at,
            submittedBy: option.submitted_by_id ? {
                id: option.submitted_by_id,
                name: option.submitted_by_name,
                email: option.submitted_by_email
            } : null,
            items: vendorOptionItemsByOption.get(option.id) || []
        });
        vendorOptionsByRequest.set(requestId, existing);
    }

    return buildRequestResponse(requestsRows, itemsByRequest, vendorOptionsByRequest);
}

// Create a procurement request (Head of Department)
router.post('/', requireAuth, requireRole('Head of Department'), async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { title, overallReason, items } = req.body;
        const orgId = req.session.orgId;
        const userId = req.session.userId;

        if (!title || typeof title !== 'string') {
            await connection.rollback();
            return res.status(400).json({
                error: 'Invalid data',
                message: 'Title is required'
            });
        }

        if (!Array.isArray(items) || items.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Invalid data',
                message: 'At least one item is required'
            });
        }

        for (const item of items) {
            if (!item.itemName || parseNumber(item.quantity) === null || parseNumber(item.quantity) <= 0) {
                await connection.rollback();
                return res.status(400).json({
                    error: 'Invalid item',
                    message: 'Each item must have a name and a positive quantity'
                });
            }
        }

        const requestNumber = generateProcurementRequestNumber(orgId);

        const [requestResult] = await connection.query(
            `INSERT INTO procurement_requests
                (org_id, request_number, requested_by_user_id, title, overall_reason)
             VALUES (?, ?, ?, ?, ?)` ,
            [orgId, requestNumber, userId, title.trim(), overallReason || null]
        );

        const requestId = requestResult.insertId;

        for (const item of items) {
            await connection.query(
                `INSERT INTO procurement_request_items (request_id, item_name, quantity, justification)
                 VALUES (?, ?, ?, ?)` ,
                [requestId, item.itemName.trim(), parseInt(item.quantity, 10), item.justification || null]
            );
        }

        await connection.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, userId, 'PROCUREMENT_REQUEST_CREATED', 'procurement_request', requestId, JSON.stringify({ requestNumber, title })]
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Procurement request submitted successfully',
            requestId,
            requestNumber
        });
    } catch (error) {
        await connection.rollback();
        console.error('Create procurement request error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'Failed to submit procurement request'
        });
    } finally {
        connection.release();
    }
});

// Get procurement requests for current organization
router.get('/', requireAuth, async (req, res) => {
    try {
        const orgId = req.session.orgId;
        const role = req.session.role;
        const userId = req.session.userId;

        const requests = await fetchRequestCollections(orgId, role, userId);

        res.json({
            success: true,
            requests
        });
    } catch (error) {
        console.error('Fetch procurement requests error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'Failed to load procurement requests'
        });
    }
});

// Get single procurement request
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const orgId = req.session.orgId;
        const role = req.session.role;
        const userId = req.session.userId;
        const requestId = Number(req.params.id);

        if (!Number.isFinite(requestId)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Invalid procurement request id'
            });
        }

        const [rows] = await db.query(
            `SELECT 
                pr.*,
                po.po_number AS po_number,
                requester.full_name AS requested_by_name,
                requester.email AS requested_by_email,
                admin.full_name AS admin_reviewer_name,
                admin.email AS admin_reviewer_email,
                admin.id AS admin_reviewer_id,
                logistics.full_name AS logistics_submitter_name,
                logistics.email AS logistics_submitter_email,
                logistics.id AS logistics_submitter_id
             FROM procurement_requests pr
             INNER JOIN users requester ON pr.requested_by_user_id = requester.id
             LEFT JOIN users admin ON pr.admin_reviewed_by_user_id = admin.id
             LEFT JOIN users logistics ON pr.logistics_submitted_by_user_id = logistics.id
             LEFT JOIN purchase_orders po ON pr.po_id = po.id
             WHERE pr.org_id = ? AND pr.id = ?
             LIMIT 1`,
            [orgId, requestId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Procurement request not found'
            });
        }

        const request = rows[0];

        if (role === 'Head of Department' && request.requested_by_user_id !== userId) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only view your own procurement requests'
            });
        }

        if (role === 'Logistics' && ![REQUEST_STATUS.ADMIN_APPROVED, REQUEST_STATUS.VENDORS_SUBMITTED, REQUEST_STATUS.PO_CREATED].includes(request.status)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only view procurement requests that are approved or in progress'
            });
        }

        if ((role === 'Finance' || role === 'Stores') && request.status !== REQUEST_STATUS.PO_CREATED) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only view procurement requests that resulted in purchase orders'
            });
        }

        const requests = buildRequestResponse([request], await (async () => {
            const map = new Map();
            const [items] = await db.query(
                `SELECT pri.id, pri.request_id, pri.item_name, pri.quantity, pri.justification, pri.created_at
                 FROM procurement_request_items pri WHERE pri.request_id = ? ORDER BY pri.id ASC`,
                [request.id]
            );
            map.set(request.id, items.map(item => ({
                id: item.id,
                itemName: item.item_name,
                quantity: item.quantity,
                justification: item.justification,
                createdAt: item.created_at
            })));
            return map;
        })(), await (async () => {
            const map = new Map();
            const [options] = await db.query(
                `SELECT pvo.id, pvo.request_id, pvo.vendor_name, pvo.total_price, pvo.notes, pvo.created_at,
                        submitter.full_name AS submitted_by_name,
                        submitter.email AS submitted_by_email,
                        submitter.id AS submitted_by_id
                 FROM procurement_vendor_options pvo
                 LEFT JOIN users submitter ON pvo.submitted_by_user_id = submitter.id
                 WHERE pvo.request_id = ?
                 ORDER BY pvo.created_at ASC`,
                [request.id]
            );

            const optionIds = options.map(option => option.id);
            const itemsMap = new Map();

            if (optionIds.length > 0) {
                const [optionItems] = await db.query(
                    `SELECT pvoi.vendor_option_id, pvoi.request_item_id, pvoi.unit_price, pvoi.total_price,
                            pri.item_name, pri.quantity
                     FROM procurement_vendor_option_items pvoi
                     INNER JOIN procurement_request_items pri ON pvoi.request_item_id = pri.id
                     WHERE pvoi.vendor_option_id IN (?)
                     ORDER BY pri.id ASC`,
                    [optionIds]
                );

                for (const item of optionItems) {
                    const current = itemsMap.get(item.vendor_option_id) || [];
                    current.push({
                        requestItemId: item.request_item_id,
                        itemName: item.item_name,
                        quantity: item.quantity,
                        unitPrice: Number(item.unit_price),
                        totalPrice: Number(item.total_price)
                    });
                    itemsMap.set(item.vendor_option_id, current);
                }
            }

            map.set(request.id, options.map(option => ({
                id: option.id,
                vendorName: option.vendor_name,
                totalPrice: Number(option.total_price),
                notes: option.notes,
                createdAt: option.created_at,
                submittedBy: option.submitted_by_id ? {
                    id: option.submitted_by_id,
                    name: option.submitted_by_name,
                    email: option.submitted_by_email
                } : null,
                items: itemsMap.get(option.id) || []
            })));

            return map;
        })());

        res.json({
            success: true,
            request: requests[0]
        });
    } catch (error) {
        console.error('Fetch procurement request error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'Failed to load procurement request'
        });
    }
});

// Admin review of procurement request
router.patch('/:id/admin-review', requireAuth, requireRole('Admin'), async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const requestId = Number(req.params.id);
        const { decision, notes } = req.body;
        const orgId = req.session.orgId;
        const userId = req.session.userId;

        if (!['Approved', 'Rejected', 'Hold'].includes(decision)) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Invalid decision',
                message: 'Decision must be Approved, Rejected, or Hold'
            });
        }

        const [rows] = await connection.query(
            `SELECT id, status FROM procurement_requests WHERE id = ? AND org_id = ? FOR UPDATE`,
            [requestId, orgId]
        );

        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                error: 'Not found',
                message: 'Procurement request not found'
            });
        }

        const request = rows[0];

        const allowedStatuses = [REQUEST_STATUS.PENDING_ADMIN_REVIEW, REQUEST_STATUS.ADMIN_HOLD];
        if (!allowedStatuses.includes(request.status)) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Invalid status',
                message: 'Only requests pending or on hold can be reviewed'
            });
        }

        let newStatus = REQUEST_STATUS.ADMIN_APPROVED;
        let adminDecision = ADMIN_DECISION.APPROVED;

        if (decision === 'Rejected') {
            newStatus = REQUEST_STATUS.ADMIN_REJECTED;
            adminDecision = ADMIN_DECISION.REJECTED;
        } else if (decision === 'Hold') {
            newStatus = REQUEST_STATUS.ADMIN_HOLD;
            adminDecision = ADMIN_DECISION.HOLD;
        }

        await connection.query(
            `UPDATE procurement_requests
             SET status = ?, admin_decision = ?, admin_notes = ?, admin_reviewed_by_user_id = ?, admin_reviewed_at = NOW()
             WHERE id = ?`,
            [newStatus, adminDecision, notes || null, userId, requestId]
        );

        await connection.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, userId, 'PROCUREMENT_REQUEST_REVIEWED', 'procurement_request', requestId, JSON.stringify({ decision, notes })]
        );

        await connection.commit();

        res.json({
            success: true,
            message: `Procurement request ${decision.toLowerCase()} successfully`
        });
    } catch (error) {
        await connection.rollback();
        console.error('Admin review error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'Failed to review procurement request'
        });
    } finally {
        connection.release();
    }
});

// Logistics submit vendor options
router.post('/:id/vendor-options', requireAuth, requireRole('Logistics'), async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const requestId = Number(req.params.id);
        const { vendors } = req.body;
        const orgId = req.session.orgId;
        const userId = req.session.userId;

        if (!Array.isArray(vendors) || vendors.length !== 3) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Invalid data',
                message: 'Exactly three vendors must be provided'
            });
        }

        const [[request]] = await connection.query(
            `SELECT pr.id, pr.status
             FROM procurement_requests pr
             WHERE pr.id = ? AND pr.org_id = ?
             FOR UPDATE`,
            [requestId, orgId]
        );

        if (!request) {
            await connection.rollback();
            return res.status(404).json({
                error: 'Not found',
                message: 'Procurement request not found'
            });
        }

        if (request.status !== REQUEST_STATUS.ADMIN_APPROVED) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Invalid status',
                message: 'Vendor options can only be submitted after admin approval'
            });
        }

        const [requestItems] = await connection.query(
            `SELECT id, quantity FROM procurement_request_items WHERE request_id = ? ORDER BY id ASC FOR UPDATE`,
            [requestId]
        );

        if (requestItems.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Procurement request has no items'
            });
        }

        const itemIdToQuantity = new Map(requestItems.map(item => [item.id, item.quantity]));

        await connection.query('DELETE FROM procurement_vendor_option_items WHERE vendor_option_id IN (SELECT id FROM procurement_vendor_options WHERE request_id = ?)', [requestId]);
        await connection.query('DELETE FROM procurement_vendor_options WHERE request_id = ?', [requestId]);

        for (const vendor of vendors) {
            if (!vendor.vendorName || !Array.isArray(vendor.items) || vendor.items.length !== requestItems.length) {
                await connection.rollback();
                return res.status(400).json({
                    error: 'Invalid vendor submission',
                    message: 'Each vendor must include pricing for all requested items'
                });
            }

            let totalPrice = 0;
            const normalizedItems = [];

            for (const vendorItem of vendor.items) {
                const requestItemId = Number(vendorItem.requestItemId);
                const unitPrice = parseNumber(vendorItem.unitPrice);

                if (!itemIdToQuantity.has(requestItemId) || unitPrice === null || unitPrice < 0) {
                    await connection.rollback();
                    return res.status(400).json({
                        error: 'Invalid vendor item',
                        message: 'Vendor pricing must include valid item ids and non-negative unit prices'
                    });
                }

                const quantity = itemIdToQuantity.get(requestItemId);
                const total = quantity * unitPrice;
                totalPrice += total;
                normalizedItems.push({ requestItemId, unitPrice, totalPrice: total });
            }

            const [vendorOptionResult] = await connection.query(
                `INSERT INTO procurement_vendor_options (request_id, vendor_name, total_price, submitted_by_user_id, notes)
                 VALUES (?, ?, ?, ?, ?)` ,
                [requestId, vendor.vendorName.trim(), totalPrice, userId, vendor.notes || null]
            );

            const vendorOptionId = vendorOptionResult.insertId;

            for (const item of normalizedItems) {
                await connection.query(
                    `INSERT INTO procurement_vendor_option_items (vendor_option_id, request_item_id, unit_price, total_price)
                     VALUES (?, ?, ?, ?)` ,
                    [vendorOptionId, item.requestItemId, item.unitPrice, item.totalPrice]
                );
            }
        }

        await connection.query(
            `UPDATE procurement_requests
             SET status = ?, logistics_submitted_by_user_id = ?, logistics_submitted_at = NOW()
             WHERE id = ?`,
            [REQUEST_STATUS.VENDORS_SUBMITTED, userId, requestId]
        );

        await connection.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, userId, 'VENDOR_OPTIONS_SUBMITTED', 'procurement_request', requestId, JSON.stringify({ vendors: vendors.map(v => v.vendorName) })]
        );

        await connection.commit();

        res.json({
            success: true,
            message: 'Vendor options submitted successfully'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Submit vendor options error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'Failed to submit vendor options'
        });
    } finally {
        connection.release();
    }
});

// Admin selects vendor and creates PO
router.post('/:id/select-vendor', requireAuth, requireRole('Admin'), async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const requestId = Number(req.params.id);
        const { vendorOptionId } = req.body;
        const orgId = req.session.orgId;
        const userId = req.session.userId;

        const [[request]] = await connection.query(
            `SELECT * FROM procurement_requests WHERE id = ? AND org_id = ? FOR UPDATE`,
            [requestId, orgId]
        );

        if (!request) {
            await connection.rollback();
            return res.status(404).json({
                error: 'Not found',
                message: 'Procurement request not found'
            });
        }

        if (request.status !== REQUEST_STATUS.VENDORS_SUBMITTED) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Invalid status',
                message: 'Vendor selection is only allowed after vendors have been submitted'
            });
        }

        const [[vendorOption]] = await connection.query(
            `SELECT * FROM procurement_vendor_options WHERE id = ? AND request_id = ? FOR UPDATE`,
            [vendorOptionId, requestId]
        );

        if (!vendorOption) {
            await connection.rollback();
            return res.status(404).json({
                error: 'Not found',
                message: 'Vendor option not found'
            });
        }

        const [vendorItems] = await connection.query(
            `SELECT pvoi.*, pri.item_name, pri.quantity
             FROM procurement_vendor_option_items pvoi
             INNER JOIN procurement_request_items pri ON pvoi.request_item_id = pri.id
             WHERE pvoi.vendor_option_id = ?
             ORDER BY pri.id ASC`,
            [vendorOptionId]
        );

        if (vendorItems.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Invalid vendor option',
                message: 'Selected vendor option is missing item pricing'
            });
        }

        const poNumber = generatePONumber(orgId);

        const [poResult] = await connection.query(
            `INSERT INTO purchase_orders
                (org_id, po_number, created_by_user_id, vendor_name, total_amount, description, status, reviewed_by_user_id, reviewed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                orgId,
                poNumber,
                userId,
                vendorOption.vendor_name,
                vendorOption.total_price,
                request.overall_reason || request.title,
                'Approved',
                userId
            ]
        );

        const poId = poResult.insertId;

        for (const item of vendorItems) {
            await connection.query(
                `INSERT INTO po_items (po_id, item_name, quantity, unit_price, total_price)
                 VALUES (?, ?, ?, ?, ?)` ,
                [poId, item.item_name, item.quantity, item.unit_price, item.total_price]
            );
        }

        await connection.query(
            `UPDATE procurement_requests
             SET status = ?, selected_vendor_option_id = ?, po_id = ?, updated_at = NOW()
             WHERE id = ?` ,
            [REQUEST_STATUS.PO_CREATED, vendorOptionId, poId, requestId]
        );

        await connection.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, userId, 'VENDOR_SELECTED', 'procurement_request', requestId, JSON.stringify({ vendorOptionId, vendorName: vendorOption.vendor_name, poNumber })]
        );

        await connection.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, userId, 'PO_CREATED_FROM_PROCUREMENT', 'purchase_order', poId, JSON.stringify({ requestId, poNumber })]
        );

        await connection.commit();

        res.json({
            success: true,
            message: 'Purchase order created successfully from procurement request',
            poId,
            poNumber
        });
    } catch (error) {
        await connection.rollback();
        console.error('Select vendor error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'Failed to create purchase order from procurement request'
        });
    } finally {
        connection.release();
    }
});

module.exports = router;
