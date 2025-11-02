const crypto = require('crypto');

function sanitizeOrgId(orgId = '') {
    return String(orgId)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(-6) || 'ORG';
}

function randomSegment(length = 4) {
    return crypto
        .randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .toUpperCase()
        .slice(0, length);
}

function timestampSegment() {
    return Date.now().toString(36).toUpperCase();
}

function generatePrefixedIdentifier(prefix, orgId) {
    const safeOrgId = sanitizeOrgId(orgId);
    const timestamp = timestampSegment();
    const random = randomSegment(4);
    return `${prefix}-${safeOrgId}-${timestamp}-${random}`;
}

function generatePONumber(orgId) {
    return generatePrefixedIdentifier('PO', orgId);
}

function generateProcurementRequestNumber(orgId) {
    return generatePrefixedIdentifier('PR', orgId);
}

module.exports = {
    generatePONumber,
    generateProcurementRequestNumber
};
