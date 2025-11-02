// Authentication and Authorization Middleware

// Check if user is authenticated
function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Please log in to access this resource' 
        });
    }
    next();
}

// Check if user has required role(s)
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ 
                error: 'Unauthorized', 
                message: 'Please log in to access this resource' 
            });
        }

        if (!allowedRoles.includes(req.session.role)) {
            return res.status(403).json({ 
                error: 'Forbidden', 
                message: 'You do not have permission to access this resource' 
            });
        }

        next();
    };
}

// Attach user info to request
function attachUserInfo(req, res, next) {
    if (req.session && req.session.userId) {
        req.user = {
            id: req.session.userId,
            email: req.session.email,
            role: req.session.role,
            orgId: req.session.orgId,
            fullName: req.session.fullName
        };
    }
    next();
}

module.exports = {
    requireAuth,
    requireRole,
    attachUserInfo
};
