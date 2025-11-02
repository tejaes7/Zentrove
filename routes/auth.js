const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/database');
db.query('SELECT 1')
  .then(() => console.log('✅ Database connected'))
  .catch(err => console.error('❌ Database connection failed:', err.message));

const { attachUserInfo } = require('../middleware/auth');

// Generate unique organization ID
function generateOrgId() {
    const prefix = 'ORG';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
}

// Signup endpoint
router.post('/signup', async (req, res) => {
    try {
        const { 
            email, 
            password, 
            fullName, 
            role, 
            signupType, 
            orgId: existingOrgId, 
            orgName,
            securityAnswer1,
            securityAnswer2,
            securityAnswer3
        } = req.body;

        // Validation
        if (!email || !password || !fullName || !signupType || !securityAnswer1 || !securityAnswer2 || !securityAnswer3) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                message: 'Please provide all required information including security questions' 
            });
        }

        let roleToAssign = role;

        let orgId = existingOrgId;

        // If creating new organization
        if (signupType === 'new') {
            if (!orgName) {
                return res.status(400).json({ 
                    error: 'Organization name required',
                    message: 'Please provide organization name' 
                });
            }

            orgId = generateOrgId();

            // Force creator to be an Admin
            roleToAssign = 'Admin';

            // Create organization
            await db.query(
                'INSERT INTO organizations (org_id, name) VALUES (?, ?)',
                [orgId, orgName]
            );
        } else if (signupType === 'join') {
            if (!role) {
                return res.status(400).json({ 
                    error: 'Role required',
                    message: 'Please select your role when joining an organization' 
                });
            }

            const joinableRoles = ['Logistics', 'Head of Department', 'Finance', 'Stores'];

            if (!joinableRoles.includes(role)) {
                return res.status(400).json({ 
                    error: 'Invalid role',
                    message: 'Please select a valid role for joining an organization' 
                });
            }

            // Verify organization exists
            const [orgs] = await db.query(
                'SELECT id FROM organizations WHERE org_id = ?',
                [existingOrgId]
            );

            if (orgs.length === 0) {
                return res.status(404).json({ 
                    error: 'Organization not found',
                    message: 'Invalid organization ID. Please check and try again.' 
                });
            }
        } else {
            return res.status(400).json({ 
                error: 'Invalid signup type',
                message: 'Signup type must be "new" or "join"' 
            });
        }

        // Check if user already exists in this organization
        const [existingUsers] = await db.query(
            'SELECT id FROM users WHERE org_id = ? AND email = ?',
            [orgId, email]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({ 
                error: 'User already exists',
                message: 'This email is already registered in this organization' 
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Hash security answers
        const securityAnswer1Hash = await bcrypt.hash(securityAnswer1.toLowerCase().trim(), 10);
        const securityAnswer2Hash = await bcrypt.hash(securityAnswer2.toLowerCase().trim(), 10);
        const securityAnswer3Hash = await bcrypt.hash(securityAnswer3.toLowerCase().trim(), 10);

        // Security question texts
        const securityQuestion1 = "Your best friend's name in high school";
        const securityQuestion2 = "Your favorite book";
        const securityQuestion3 = "Your favorite place";

        // Create user
        const [result] = await db.query(
            `INSERT INTO users (org_id, email, password_hash, full_name, role, security_question_1, security_answer_1_hash, security_question_2, security_answer_2_hash, security_question_3, security_answer_3_hash) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [orgId, email, passwordHash, fullName, roleToAssign, securityQuestion1, securityAnswer1Hash, securityQuestion2, securityAnswer2Hash, securityQuestion3, securityAnswer3Hash]
        );

        // Log the signup
        await db.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [orgId, result.insertId, 'USER_SIGNUP', 'user', result.insertId, JSON.stringify({ email, role: roleToAssign })]
        );

        res.status(201).json({ 
            success: true,
            message: 'Account created successfully',
            orgId: orgId,
            userId: result.insertId
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to create account. Please try again.' 
        });
    }
});

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Missing credentials',
                message: 'Please provide email and password' 
            });
        }

        // Find user by email (across all organizations)
        const [users] = await db.query(
            'SELECT id, org_id, email, password_hash, full_name, role, is_active FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ 
                error: 'Invalid credentials',
                message: 'Email or password is incorrect' 
            });
        }

        const user = users[0];

        // Check if user is active
        if (!user.is_active) {
            return res.status(403).json({ 
                error: 'Account disabled',
                message: 'Your account has been disabled. Please contact your administrator.' 
            });
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ 
                error: 'Invalid credentials',
                message: 'Email or password is incorrect' 
            });
        }

        // Create session
        req.session.userId = user.id;
        req.session.email = user.email;
        req.session.role = user.role;
        req.session.orgId = user.org_id;
        req.session.fullName = user.full_name;

        // Log the login
        await db.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
            [user.org_id, user.id, 'USER_LOGIN', 'user', user.id, req.ip]
        );

        res.json({ 
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                role: user.role,
                orgId: user.org_id
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to log in. Please try again.' 
        });
    }
});

// Logout endpoint
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ 
                error: 'Logout failed',
                message: 'Failed to log out. Please try again.' 
            });
        }
        res.json({ 
            success: true,
            message: 'Logged out successfully' 
        });
    });
});

// Check session endpoint
router.get('/check', attachUserInfo, (req, res) => {
    if (req.user) {
        res.json({ 
            authenticated: true,
            user: req.user
        });
    } else {
        res.json({ 
            authenticated: false 
        });
    }
});

// Forgot Password: Check if email exists
router.post('/forgot-password/check-email', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ 
                error: 'Email required',
                message: 'Please provide an email address' 
            });
        }

        // Find user by email
        const [users] = await db.query(
            'SELECT id, email, org_id FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({ 
                error: 'Email not found',
                message: 'No account found with this email address' 
            });
        }

        res.json({ 
            success: true,
            message: 'Email found. Please answer your security questions.'
        });

    } catch (error) {
        console.error('Check email error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to check email. Please try again.' 
        });
    }
});

// Forgot Password: Get security questions
router.post('/forgot-password/get-questions', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ 
                error: 'Email required',
                message: 'Please provide an email address' 
            });
        }

        // Get user's security questions
        const [users] = await db.query(
            'SELECT security_question_1, security_question_2, security_question_3 FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({ 
                error: 'Email not found',
                message: 'No account found with this email address' 
            });
        }

        const user = users[0];

        res.json({ 
            success: true,
            questions: [
                user.security_question_1,
                user.security_question_2,
                user.security_question_3
            ]
        });

    } catch (error) {
        console.error('Get questions error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to retrieve security questions. Please try again.' 
        });
    }
});

// Forgot Password: Verify security answers
router.post('/forgot-password/verify-answers', async (req, res) => {
    try {
        const { email, answer1, answer2, answer3 } = req.body;

        if (!email || !answer1 || !answer2 || !answer3) {
            return res.status(400).json({ 
                error: 'Missing answers',
                message: 'Please provide answers to all security questions' 
            });
        }

        // Get user's security answers
        const [users] = await db.query(
            'SELECT id, security_answer_1_hash, security_answer_2_hash, security_answer_3_hash FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({ 
                error: 'Email not found',
                message: 'No account found with this email address' 
            });
        }

        const user = users[0];

        // Verify all three answers (case-insensitive)
        const answer1Match = await bcrypt.compare(answer1.toLowerCase().trim(), user.security_answer_1_hash);
        const answer2Match = await bcrypt.compare(answer2.toLowerCase().trim(), user.security_answer_2_hash);
        const answer3Match = await bcrypt.compare(answer3.toLowerCase().trim(), user.security_answer_3_hash);

        if (!answer1Match || !answer2Match || !answer3Match) {
            return res.status(401).json({ 
                error: 'Incorrect answers',
                message: 'One or more security answers are incorrect. Please try again.' 
            });
        }

        // Generate a simple token (in production, use a more secure token mechanism)
        const token = crypto.randomBytes(32).toString('hex');
        
        // Store token in session (or use Redis/database in production)
        req.session.passwordResetToken = token;
        req.session.passwordResetEmail = email;

        res.json({ 
            success: true,
            message: 'Security questions verified successfully',
            token: token
        });

    } catch (error) {
        console.error('Verify answers error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to verify answers. Please try again.' 
        });
    }
});

// Forgot Password: Reset password
router.post('/forgot-password/reset', async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;

        if (!email || !token || !newPassword) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                message: 'Please provide email, token, and new password' 
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ 
                error: 'Password too short',
                message: 'Password must be at least 6 characters long' 
            });
        }

        // Verify token from session (or database in production)
        if (!req.session.passwordResetToken || req.session.passwordResetToken !== token || req.session.passwordResetEmail !== email) {
            return res.status(401).json({ 
                error: 'Invalid token',
                message: 'Invalid or expired reset token. Please start the password reset process again.' 
            });
        }

        // Find user
        const [users] = await db.query(
            'SELECT id, org_id FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({ 
                error: 'Email not found',
                message: 'No account found with this email address' 
            });
        }

        const user = users[0];

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Update password
        await db.query(
            'UPDATE users SET password_hash = ? WHERE email = ?',
            [passwordHash, email]
        );

        // Log the password reset
        await db.query(
            'INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [user.org_id, user.id, 'PASSWORD_RESET', 'user', user.id, JSON.stringify({ email, reset_method: 'security_questions' })]
        );

        // Clear reset token from session
        delete req.session.passwordResetToken;
        delete req.session.passwordResetEmail;

        res.json({ 
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Failed to reset password. Please try again.' 
        });
    }
});

module.exports = router;
