const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/auth');

// Get all users in organization (Admin only)
router.get('/', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        const orgId = req.session.orgId;

        const [users] = await db.query(
            `SELECT id, email, full_name, role, is_active, created_at 
            FROM users 
            WHERE org_id = ? 
            ORDER BY created_at DESC`,
            [orgId]
        );

        res.json({ 
            success: true,
            users
        });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to retrieve users' 
        });
    }
});

// Update user role (Admin only)
router.patch('/:id/role', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        const targetUserId = req.params.id;
        const { role } = req.body;
        const orgId = req.session.orgId;
        const adminUserId = req.session.userId;

        // Validate role
        const validRoles = ['Logistics', 'Head of Department', 'Finance', 'Stores', 'Admin'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ 
                error: 'Invalid role',
                message: 'Please select a valid role' 
            });
        }

        // Verify target user exists and belongs to same org
        const [users] = await db.query(
            'SELECT id, email FROM users WHERE id = ? AND org_id = ?',
            [targetUserId, orgId]
        );

        if (users.length === 0) {
            return res.status(404).json({ 
                error: 'User not found',
                message: 'User not found in your organization' 
            });
        }

        // Update role
        await db.query(
            'UPDATE users SET role = ? WHERE id = ?',
            [role, targetUserId]
        );

        // Log the action
        await db.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, adminUserId, 'USER_ROLE_UPDATED', 'user', targetUserId, JSON.stringify({ newRole: role, targetEmail: users[0].email })]
        );

        res.json({ 
            success: true,
            message: 'User role updated successfully'
        });

    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to update user role' 
        });
    }
});

// Toggle user active status (Admin only)
router.patch('/:id/status', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        const targetUserId = req.params.id;
        const { isActive } = req.body;
        const orgId = req.session.orgId;
        const adminUserId = req.session.userId;

        // Prevent admin from deactivating themselves
        if (targetUserId == adminUserId) {
            return res.status(400).json({ 
                error: 'Invalid operation',
                message: 'You cannot deactivate your own account' 
            });
        }

        // Verify target user exists and belongs to same org
        const [users] = await db.query(
            'SELECT id, email FROM users WHERE id = ? AND org_id = ?',
            [targetUserId, orgId]
        );

        if (users.length === 0) {
            return res.status(404).json({ 
                error: 'User not found',
                message: 'User not found in your organization' 
            });
        }

        // Update status
        await db.query(
            'UPDATE users SET is_active = ? WHERE id = ?',
            [isActive ? 1 : 0, targetUserId]
        );

        // Log the action
        await db.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, adminUserId, 'USER_STATUS_UPDATED', 'user', targetUserId, JSON.stringify({ isActive, targetEmail: users[0].email })]
        );

        res.json({ 
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
        });

    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to update user status' 
        });
    }
});

// Reset user password (Admin only)
router.patch('/:id/password', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        const targetUserId = req.params.id;
        const { newPassword } = req.body;
        const orgId = req.session.orgId;
        const adminUserId = req.session.userId;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ 
                error: 'Invalid password',
                message: 'Password must be at least 6 characters' 
            });
        }

        // Verify target user exists and belongs to same org
        const [users] = await db.query(
            'SELECT id, email FROM users WHERE id = ? AND org_id = ?',
            [targetUserId, orgId]
        );

        if (users.length === 0) {
            return res.status(404).json({ 
                error: 'User not found',
                message: 'User not found in your organization' 
            });
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Update password
        await db.query(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [passwordHash, targetUserId]
        );

        // Log the action
        await db.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, adminUserId, 'USER_PASSWORD_RESET', 'user', targetUserId, JSON.stringify({ targetEmail: users[0].email })]
        );

        res.json({ 
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to reset password' 
        });
    }
});

module.exports = router;
