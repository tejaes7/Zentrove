// Global variables
let currentUser = null;
let currentPOs = [];
let selectedPOId = null;
let currentProcurementRequests = [];
let adminReviewRequestId = null;
let vendorOptionsRequestId = null;
let vendorSelectionRequestId = null;
let selectedVendorOptionId = null;

const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

function formatCurrency(value) {
    const amount = Number(value) || 0;
    return currencyFormatter.format(amount);
}

function normalizeReviewStatus(status) {
    if (!status) return 'Pending';
    const mapping = {
        'On Hold': 'Hold'
    };
    return mapping[status] || status;
}

function normalizeDeliveryStatus(status) {
    if (!status) return 'Not Received';
    const mapping = {
        'Not Delivered': 'Not Received',
        'Partially Delivered': 'Partially Received',
        'Delivered': 'Received Delivery'
    };
    return mapping[status] || status;
}

function getProcurementStatusBadge(status) {
    const normalized = status || 'Pending Admin Review';
    const labelMap = {
        'Pending Admin Review': 'Pending Admin Review',
        'Admin Approved': 'Awaiting Vendors',
        'Admin Rejected': 'Rejected',
        'Admin Hold': 'On Hold',
        'Vendors Submitted': 'Awaiting Selection',
        'PO Created': 'PO Created'
    };

    const classMap = {
        'Pending Admin Review': 'badge-pending',
        'Admin Approved': 'badge-pending',
        'Admin Rejected': 'badge-rejected',
        'Admin Hold': 'badge-hold',
        'Vendors Submitted': 'badge-approved',
        'PO Created': 'badge-approved'
    };

    const label = labelMap[normalized] || normalized;
    const badgeClass = classMap[normalized] || 'badge-pending';
    return `<span class="badge ${badgeClass}">${label}</span>`;
}

function getAdminDecisionBadge(decision) {
    const normalized = decision || 'Pending';
    const classMap = {
        Pending: 'badge-pending',
        Approved: 'badge-approved',
        Rejected: 'badge-rejected',
        Hold: 'badge-hold'
    };

    const badgeClass = classMap[normalized] || 'badge-pending';
    return `<span class="badge ${badgeClass}">${normalized}</span>`;
}

const statIcons = {
    sheets: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke-width="1.6" stroke-linejoin="round" />
        <path d="M8 9h8M8 13h8M8 17h5" stroke-width="1.6" stroke-linecap="round" />
    </svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="8" stroke-width="1.6" />
        <path d="M12 8v4l2.5 1.5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="8" stroke-width="1.6" />
        <path d="M9 12.2l2.2 2.2 4-4.4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`,
    cross: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="8" stroke-width="1.6" />
        <path d="M14.5 9.5l-5 5m0-5l5 5" stroke-width="1.6" stroke-linecap="round" />
    </svg>`,
    currency: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M7 6h10M7 10h10M13 6c2 2 2 6-2 6H7l6 8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`,
    box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" stroke-width="1.6" stroke-linejoin="round" />
        <path d="M12 12 20 7.5" stroke-width="1.6" stroke-linejoin="round" />
        <path d="m12 12-8-4.5" stroke-width="1.6" stroke-linejoin="round" />
    </svg>`
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadDashboard();
});

// Check authentication
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();
        
        if (!data.authenticated) {
            window.location.href = '/';
            return;
        }
        
        currentUser = data.user;
        updateUserUI();
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/';
    }
}

// Update user interface with user info
function updateUserUI() {
    document.getElementById('user-name').textContent = currentUser.fullName;
    document.getElementById('user-role').textContent = currentUser.role;
    document.getElementById('user-avatar').textContent = currentUser.fullName.charAt(0).toUpperCase();
    document.getElementById('org-info').textContent = currentUser.orgId;
    const welcomeHeading = document.getElementById('welcome-heading');
    if (welcomeHeading) {
        const fullName = currentUser.fullName || '';
        const firstName = fullName.split(' ')[0] || fullName;
        welcomeHeading.textContent = `Welcome back, ${firstName}`;
    }
    const welcomeRole = document.getElementById('welcome-role');
    if (welcomeRole) {
        welcomeRole.textContent = currentUser.role;
    }
    const welcomeDate = document.getElementById('welcome-date');
    if (welcomeDate) {
        welcomeDate.textContent = new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }
    
    // Show role-specific navigation
    const createPoLink = document.getElementById('create-po-link');
    const createPoBtn = document.getElementById('create-po-btn');
    if (createPoLink) {
        createPoLink.style.display = 'none';
    }
    if (createPoBtn) {
        createPoBtn.style.display = 'none';
    }

    if (currentUser.role === 'Admin') {
        document.getElementById('admin-link').style.display = 'flex';
    }

    const procurementButton = document.getElementById('request-procurement-btn');
    if (procurementButton) {
        procurementButton.style.display = currentUser.role === 'Head of Department' ? 'inline-block' : 'none';
    }

    const procurementContainer = document.getElementById('procurement-requests-container');
    if (procurementContainer) {
        procurementContainer.style.display = ['Head of Department', 'Admin', 'Logistics'].includes(currentUser.role) ? '' : 'none';
    }

    // Show role-specific table headers
    if (['Head of Department', 'Finance', 'Stores', 'Admin'].includes(currentUser.role)) {
        document.getElementById('payment-status-header').style.display = 'table-cell';
        document.getElementById('delivery-status-header').style.display = 'table-cell';
    }
}

// Load dashboard data
async function loadDashboard() {
    await Promise.all([
        loadStats(),
        loadPurchaseOrders(),
        loadProcurementRequests()
    ]);
}

// Load statistics
async function loadStats() {
    try {
        const response = await fetch('/api/dashboard/stats');
        const data = await response.json();
        
        if (data.success) {
            renderStats(data.stats);
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Render statistics cards
function renderStats(stats) {
    const statsGrid = document.getElementById('stats-grid');
    if (!statsGrid) {
        return;
    }

    let html = '';

    // Role-specific PO stats
    if (currentUser.role === 'Logistics') {
        html += `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon blue">${statIcons.sheets}</div>
                </div>
                <div class="stat-value">${stats.total || 0}</div>
                <div class="stat-label">Total POs</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon yellow">${statIcons.clock}</div>
                </div>
                <div class="stat-value">${stats.pending || 0}</div>
                <div class="stat-label">Pending Review</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon green">${statIcons.check}</div>
                </div>
                <div class="stat-value">${stats.approved || 0}</div>
                <div class="stat-label">Approved</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon red">${statIcons.cross}</div>
                </div>
                <div class="stat-value">${stats.rejected || 0}</div>
                <div class="stat-label">Rejected</div>
            </div>
        `;
    } else if (currentUser.role === 'Head of Department' || currentUser.role === 'Admin') {
        html += `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon blue">${statIcons.sheets}</div>
                </div>
                <div class="stat-value">${stats.total || 0}</div>
                <div class="stat-label">Total POs</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon yellow">${statIcons.clock}</div>
                </div>
                <div class="stat-value">${stats.pending || 0}</div>
                <div class="stat-label">Awaiting Review</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon green">${statIcons.check}</div>
                </div>
                <div class="stat-value">${stats.approved || 0}</div>
                <div class="stat-label">Approved</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon blue">${statIcons.currency}</div>
                </div>
                <div class="stat-value">${formatCurrency(stats.totalAmount)}</div>
                <div class="stat-label">Total Amount</div>
            </div>
        `;
    } else if (currentUser.role === 'Finance') {
        html += `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon blue">${statIcons.sheets}</div>
                </div>
                <div class="stat-value">${stats.total || 0}</div>
                <div class="stat-label">Approved POs</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon red">${statIcons.cross}</div>
                </div>
                <div class="stat-value">${stats.notPaid || 0}</div>
                <div class="stat-label">Not Paid</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon yellow">${statIcons.clock}</div>
                </div>
                <div class="stat-value">${stats.partiallyPaid || 0}</div>
                <div class="stat-label">Partially Paid</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon green">${statIcons.check}</div>
                </div>
                <div class="stat-value">${stats.paid || 0}</div>
                <div class="stat-label">Paid</div>
            </div>
        `;
    } else if (currentUser.role === 'Stores') {
        html += `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon blue">${statIcons.sheets}</div>
                </div>
                <div class="stat-value">${stats.total || 0}</div>
                <div class="stat-label">Approved POs</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon red">${statIcons.cross}</div>
                </div>
                <div class="stat-value">${stats.notReceived || 0}</div>
                <div class="stat-label">Not Received</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon yellow">${statIcons.clock}</div>
                </div>
                <div class="stat-value">${stats.partiallyReceived || 0}</div>
                <div class="stat-label">Partially Received</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon green">${statIcons.box}</div>
                </div>
                <div class="stat-value">${stats.receivedDelivery || 0}</div>
                <div class="stat-label">Received Delivery</div>
            </div>
        `;
    }

    if (stats.procurementRequests && ['Head of Department', 'Admin', 'Logistics'].includes(currentUser.role)) {
        html += renderProcurementStatsCards(stats.procurementRequests, currentUser.role);
    }

    statsGrid.innerHTML = html;
}

function renderProcurementStatsCards(procurementStats, role) {
    const cards = [];

    if (role === 'Head of Department') {
        cards.push(
            {
                label: 'Awaiting Admin Review',
                value: procurementStats.pendingAdminReview || 0,
                icon: statIcons.clock,
                color: 'yellow'
            },
            {
                label: 'Awaiting Vendor Quotes',
                value: procurementStats.adminApproved || 0,
                icon: statIcons.sheets,
                color: 'blue'
            },
            {
                label: 'Quotes Submitted',
                value: procurementStats.vendorsSubmitted || 0,
                icon: statIcons.check,
                color: 'green'
            },
            {
                label: 'Converted to PO',
                value: procurementStats.poCreated || 0,
                icon: statIcons.box,
                color: 'green'
            }
        );
    } else if (role === 'Admin') {
        cards.push(
            {
                label: 'Pending Decision',
                value: (procurementStats.pendingAdminReview || 0) + (procurementStats.adminHold || 0),
                icon: statIcons.clock,
                color: 'yellow'
            },
            {
                label: 'Awaiting Vendors',
                value: procurementStats.adminApproved || 0,
                icon: statIcons.sheets,
                color: 'blue'
            },
            {
                label: 'Quotes Ready',
                value: procurementStats.vendorsSubmitted || 0,
                icon: statIcons.check,
                color: 'green'
            },
            {
                label: 'POs Created',
                value: procurementStats.poCreated || 0,
                icon: statIcons.box,
                color: 'green'
            }
        );
    } else if (role === 'Logistics') {
        cards.push(
            {
                label: 'Awaiting Vendor Quotes',
                value: procurementStats.adminApproved || 0,
                icon: statIcons.clock,
                color: 'yellow'
            },
            {
                label: 'Quotes Submitted',
                value: procurementStats.vendorsSubmitted || 0,
                icon: statIcons.sheets,
                color: 'blue'
            }
        );
    }

    if (!cards.length) {
        return '';
    }

    return cards.map(card => `
        <div class="stat-card">
            <div class="stat-header">
                <div class="stat-icon ${card.color}">${card.icon}</div>
            </div>
            <div class="stat-value">${card.value}</div>
            <div class="stat-label">${card.label}</div>
        </div>
    `).join('');
}

// Load purchase orders
async function loadPurchaseOrders() {
    try {
        const response = await fetch('/api/purchase-orders');
        const data = await response.json();
        
        if (data.success) {
            currentPOs = data.purchaseOrders;
            renderPurchaseOrders(currentPOs);
        }
    } catch (error) {
        console.error('Failed to load purchase orders:', error);
        showAlert('Failed to load purchase orders', 'error');
    }
}

// Load procurement requests
async function loadProcurementRequests() {
    const container = document.getElementById('procurement-requests-container');
    if (!container || !currentUser) {
        return;
    }

    const allowedRoles = ['Head of Department', 'Admin', 'Logistics'];
    if (!allowedRoles.includes(currentUser.role)) {
        container.style.display = 'none';
        return;
    }

    container.style.display = '';

    try {
        const response = await fetch('/api/procurement-requests');
        const data = await response.json();

        if (data.success) {
            currentProcurementRequests = Array.isArray(data.requests) ? data.requests : [];
            renderProcurementRequests(currentProcurementRequests);
        } else {
            showAlert(data.message || 'Failed to load procurement requests', 'error');
        }
    } catch (error) {
        console.error('Failed to load procurement requests:', error);
        showAlert('Failed to load procurement requests', 'error');
    }
}

// Render purchase orders table
function renderPurchaseOrders(pos) {
    const tbody = document.getElementById('po-table-body');
    
    if (pos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px;">
                    <div class="empty-state">
                        <div class="empty-state-icon">??</div>
                        <h3>No Purchase Orders</h3>
                        <p>There are no purchase orders to display</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = pos.map(po => {
        const createdDate = new Date(po.created_at).toLocaleDateString();
        const paymentStatus = po.payment_status || 'Not Paid';
        const deliveryStatus = normalizeDeliveryStatus(po.delivery_status);
        const reviewStatus = normalizeReviewStatus(po.status);
        const paymentClass = `badge-${paymentStatus.toLowerCase().replace(/\s+/g, '-')}`;
        const deliveryClass = `badge-${deliveryStatus.toLowerCase().replace(/\s+/g, '-')}`;
        const reviewClass = `badge-${reviewStatus.toLowerCase().replace(/\s+/g, '-')}`;
        const paymentStatusArg = JSON.stringify(paymentStatus);
        const deliveryStatusArg = JSON.stringify(deliveryStatus);

        const createActionButton = (label, classes, onClick, enabled = true, tooltip = '') => {
            const disabledAttr = enabled ? '' : ' disabled';
            const titleAttr = tooltip ? ` title="${tooltip.replace(/"/g, '&quot;')}"` : '';
            const onClickAttr = enabled && onClick
                ? ` onclick='${onClick.replace(/'/g, "\\'")}'`
                : '';
            return `<button class="${classes}"${onClickAttr}${disabledAttr}${titleAttr}>${label}</button>`;
        };

        const actionButtons = [];
        actionButtons.push(createActionButton('View', 'btn-icon btn-primary', `viewPODetails(${po.id})`));

        if (currentUser.role === 'Head of Department') {
            const canReview = ['Pending', 'Hold'].includes(reviewStatus);
            const hodTooltip = canReview ? '' : 'Status updates are available only while the PO is pending or on hold';
            actionButtons.push(createActionButton('Update Status', 'btn-icon btn-secondary', `openReviewModal(${po.id}, ${JSON.stringify(reviewStatus)})`, canReview, hodTooltip));
        }

        if (currentUser.role === 'Finance') {
            const hodApproved = reviewStatus === 'Approved';
            const financeTooltip = hodApproved ? '' : 'Awaiting head of department approval';
            actionButtons.push(createActionButton('Update Payment Status', 'btn-icon btn-secondary', `openPaymentModal(${po.id}, ${paymentStatusArg})`, hodApproved, financeTooltip));
        }

        if (currentUser.role === 'Stores') {
            const financeCleared = ['Paid', 'Partially Paid'].includes(paymentStatus);
            const storesTooltip = financeCleared ? '' : 'Finance must mark as paid or partially paid before receiving goods';
            actionButtons.push(createActionButton('Update Delivery Status', 'btn-icon btn-secondary', `openDeliveryModal(${po.id}, ${deliveryStatusArg})`, financeCleared, storesTooltip));
        }

        const paymentCell = ['Head of Department', 'Finance', 'Stores', 'Admin'].includes(currentUser.role)
            ? `<td><span class="badge ${paymentClass}">${paymentStatus}</span></td>`
            : '';

        const deliveryCell = ['Head of Department', 'Finance', 'Stores', 'Admin'].includes(currentUser.role)
            ? `<td><span class="badge ${deliveryClass}">${deliveryStatus}</span></td>`
            : '';

        return `
            <tr>
                <td><strong>${po.po_number}</strong></td>
                <td>${po.vendor_name}</td>
                <td>${formatCurrency(po.total_amount)}</td>
                <td><span class="badge ${reviewClass}">${reviewStatus}</span></td>
                ${paymentCell}
                ${deliveryCell}
                <td>${createdDate}</td>
                <td>
                    <div class="action-buttons">
                        ${actionButtons.join(' ')}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Render procurement requests table
function renderProcurementRequests(requests) {
    const headerRow = document.getElementById('procurement-requests-header-row');
    const tbody = document.getElementById('procurement-requests-body');

    if (!headerRow || !tbody) {
        return;
    }

    const role = currentUser.role;
    let headerHtml = '';
    let columnCount = 0;

    if (role === 'Head of Department') {
        headerHtml = `
            <th>Request #</th>
            <th>Title</th>
            <th>Status</th>
            <th>Admin Decision</th>
            <th>PO</th>
            <th>Created</th>
            <th>Actions</th>
        `;
        columnCount = 7;
    } else if (role === 'Admin') {
        headerHtml = `
            <th>Request #</th>
            <th>Title</th>
            <th>Requested By</th>
            <th>Status</th>
            <th>Vendors</th>
            <th>PO</th>
            <th>Created</th>
            <th>Actions</th>
        `;
        columnCount = 8;
    } else if (role === 'Logistics') {
        headerHtml = `
            <th>Request #</th>
            <th>Title</th>
            <th>Requested By</th>
            <th>Status</th>
            <th>Submitted</th>
            <th>Created</th>
            <th>Actions</th>
        `;
        columnCount = 7;
    } else {
        headerRow.innerHTML = '';
        tbody.innerHTML = '';
        return;
    }

    headerRow.innerHTML = headerHtml;

    if (!requests.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${columnCount}" style="text-align: center; padding: 40px;">
                    <div class="empty-state">
                        <div class="empty-state-icon">??</div>
                        <h3>No Procurement Requests</h3>
                        <p>There are no procurement requests to display yet.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const createActionButton = (label, classes, onClick, enabled = true, tooltip = '') => {
        const disabledAttr = enabled ? '' : ' disabled';
        const titleAttr = tooltip ? ` title="${tooltip.replace(/"/g, '&quot;')}"` : '';
        const onClickAttr = enabled && onClick
            ? ` onclick='${onClick.replace(/'/g, "\\'")}'`
            : '';
        return `<button class="${classes}"${onClickAttr}${disabledAttr}${titleAttr}>${label}</button>`;
    };

    const rowsHtml = requests.map(request => {
        const statusBadge = getProcurementStatusBadge(request.status);
        const adminDecision = request.adminDecision && request.adminDecision !== 'Pending'
            ? request.adminDecision
            : 'Pending';
        const adminDecisionBadge = getAdminDecisionBadge(adminDecision);
        const createdDate = request.createdAt ? new Date(request.createdAt).toLocaleDateString() : '?';
        const vendorCount = request.vendorOptions ? request.vendorOptions.length : 0;
        const poDisplay = request.poNumber ? `<span class="badge badge-approved">${request.poNumber}</span>` : '?';

        const actionButtons = [];
        actionButtons.push(createActionButton('View', 'btn-icon btn-primary', `openProcurementRequestDetails(${request.id})`));

        if (role === 'Admin') {
            const canReview = ['Pending Admin Review', 'Admin Hold'].includes(request.status);
            if (canReview) {
                actionButtons.push(createActionButton('Review', 'btn-icon btn-secondary', `openAdminReviewModal(${request.id})`));
            }

            const canSelectVendor = request.status === 'Vendors Submitted' && vendorCount >= 1;
            actionButtons.push(createActionButton(
                'Select Vendor',
                'btn-icon btn-primary',
                `openSelectVendorModal(${request.id})`,
                canSelectVendor,
                canSelectVendor ? '' : 'Waiting for logistics to submit vendor options'
            ));
        }

        if (role === 'Logistics') {
            const awaitingSubmission = request.status === 'Admin Approved';
            const alreadySubmitted = request.status === 'Vendors Submitted';
            if (awaitingSubmission || alreadySubmitted) {
                const label = awaitingSubmission ? 'Submit Vendors' : 'Update Vendors';
                actionButtons.push(createActionButton(
                    label,
                    'btn-icon btn-secondary',
                    `openVendorOptionsModal(${request.id})`
                ));
            }
        }

        let rowColumns = '';

        if (role === 'Head of Department') {
            rowColumns = `
                <td><strong>${request.requestNumber}</strong></td>
                <td>${request.title}</td>
                <td>${statusBadge}</td>
                <td>${adminDecisionBadge}</td>
                <td>${poDisplay}</td>
                <td>${createdDate}</td>
                <td>
                    <div class="action-buttons">
                        ${actionButtons.join(' ')}
                    </div>
                </td>
            `;
        } else if (role === 'Admin') {
            rowColumns = `
                <td><strong>${request.requestNumber}</strong></td>
                <td>${request.title}</td>
                <td>${request.requestedBy ? request.requestedBy.name : '?'}</td>
                <td>${statusBadge}</td>
                <td><span class="badge badge-pending">${vendorCount} / 3</span></td>
                <td>${poDisplay}</td>
                <td>${createdDate}</td>
                <td>
                    <div class="action-buttons">
                        ${actionButtons.join(' ')}
                    </div>
                </td>
            `;
        } else {
            const submittedLabel = vendorCount >= 1 ? '<span class="badge badge-approved">Yes</span>' : '<span class="badge badge-pending">No</span>';
            rowColumns = `
                <td><strong>${request.requestNumber}</strong></td>
                <td>${request.title}</td>
                <td>${request.requestedBy ? request.requestedBy.name : '?'}</td>
                <td>${statusBadge}</td>
                <td>${submittedLabel}</td>
                <td>${createdDate}</td>
                <td>
                    <div class="action-buttons">
                        ${actionButtons.join(' ')}
                    </div>
                </td>
            `;
        }

        return `<tr>${rowColumns}</tr>`;
    }).join('');

    tbody.innerHTML = rowsHtml;
}

function getProcurementRequestById(requestId) {
    return currentProcurementRequests.find(request => request.id === requestId);
}

async function fetchProcurementRequest(requestId) {
    try {
        const response = await fetch(`/api/procurement-requests/${requestId}`);
        const data = await response.json();
        if (data.success && data.request) {
            return data.request;
        }
        return null;
    } catch (error) {
        console.error('Failed to fetch procurement request:', error);
        return null;
    }
}

function mergeProcurementRequest(updatedRequest) {
    const index = currentProcurementRequests.findIndex(request => request.id === updatedRequest.id);
    if (index >= 0) {
        currentProcurementRequests[index] = updatedRequest;
    } else {
        currentProcurementRequests.unshift(updatedRequest);
    }
}

async function ensureProcurementRequest(requestId) {
    let request = getProcurementRequestById(requestId);
    if (request) {
        return request;
    }
    const fetched = await fetchProcurementRequest(requestId);
    if (fetched) {
        mergeProcurementRequest(fetched);
        renderProcurementRequests(currentProcurementRequests);
    }
    return fetched;
}

function openProcurementRequestModal() {
    resetProcurementRequestForm();
    openModal('procurement-request-modal');
}

function resetProcurementRequestForm() {
    const titleField = document.getElementById('pr-title');
    const reasonField = document.getElementById('pr-reason');
    const container = document.getElementById('pr-items-container');

    if (titleField) {
        titleField.value = '';
    }
    if (reasonField) {
        reasonField.value = '';
    }
    if (container) {
        container.innerHTML = '';
        addProcurementItem();
    }
}

function addProcurementItem(existingItem = {}) {
    const container = document.getElementById('pr-items-container');
    if (!container) {
        return;
    }

    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
        <div class="form-group">
            <label>Item Name *</label>
            <input type="text" class="pr-item-name" placeholder="Item name" value="${existingItem.itemName ? existingItem.itemName : ''}">
        </div>
        <div class="form-group">
            <label>Quantity *</label>
            <input type="number" class="pr-item-quantity" min="1" placeholder="Qty" value="${existingItem.quantity ? existingItem.quantity : ''}">
        </div>
        <div class="form-group">
            <label>Justification</label>
            <input type="text" class="pr-item-justification" placeholder="Reason" value="${existingItem.justification ? existingItem.justification : ''}">
        </div>
        <div class="form-group">
            <button type="button" class="btn btn-sm btn-danger" onclick="removeProcurementItem(this)" style="margin-top: 28px;">Remove</button>
        </div>
    `;

    container.appendChild(row);
}

function removeProcurementItem(button) {
    const container = document.getElementById('pr-items-container');
    if (!container) {
        return;
    }
    if (container.children.length <= 1) {
        showAlert('You must have at least one item in the request.', 'error');
        return;
    }
    const row = button.closest('.item-row');
    if (row) {
        row.remove();
    }
}

function collectProcurementItems() {
    const container = document.getElementById('pr-items-container');
    if (!container) {
        return [];
    }

    const rows = container.querySelectorAll('.item-row');
    if (!rows.length) {
        showAlert('Add at least one item to the procurement request.', 'error');
        return null;
    }

    const items = [];
    for (const row of rows) {
        const nameInput = row.querySelector('.pr-item-name');
        const quantityInput = row.querySelector('.pr-item-quantity');
        const justificationInput = row.querySelector('.pr-item-justification');

        const itemName = nameInput ? nameInput.value.trim() : '';
        const quantityValue = quantityInput ? parseInt(quantityInput.value, 10) : NaN;
        const justification = justificationInput ? justificationInput.value.trim() : '';

        if (!itemName) {
            showAlert('Each item must have a name.', 'error');
            return null;
        }
        if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
            showAlert('Each item must have a quantity greater than zero.', 'error');
            return null;
        }

        items.push({
            itemName,
            quantity: quantityValue,
            justification: justification || null
        });
    }

    return items;
}

async function submitProcurementRequest() {
    if (!currentUser || currentUser.role !== 'Head of Department') {
        return;
    }

    const titleField = document.getElementById('pr-title');
    const reasonField = document.getElementById('pr-reason');

    const title = titleField ? titleField.value.trim() : '';
    const overallReason = reasonField ? reasonField.value.trim() : '';

    if (!title) {
        showAlert('Provide a title for the procurement request.', 'error');
        return;
    }

    const items = collectProcurementItems();
    if (!items) {
        return;
    }

    try {
        const response = await fetch('/api/procurement-requests', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                overallReason,
                items
            })
        });

        const data = await response.json();

        if (response.ok) {
            showAlert(data.message || 'Procurement request submitted successfully', 'success');
            closeModal('procurement-request-modal');
            await Promise.all([
                loadProcurementRequests(),
                loadStats()
            ]);
        } else {
            showAlert(data.message || 'Failed to submit procurement request', 'error');
        }
    } catch (error) {
        console.error('Submit procurement request error:', error);
        showAlert('Failed to submit procurement request', 'error');
    }
}

async function openProcurementRequestDetails(requestId) {
    const request = await ensureProcurementRequest(requestId);
    if (!request) {
        showAlert('Unable to load procurement request details.', 'error');
        return;
    }

    const detailsContainer = document.getElementById('procurement-request-details-content');
    if (!detailsContainer) {
        return;
    }

    detailsContainer.innerHTML = buildProcurementRequestDetailsHtml(request);
    openModal('procurement-request-details-modal');
}

function buildProcurementRequestDetailsHtml(request) {
    const statusBadge = getProcurementStatusBadge(request.status);
    const adminDecisionBadge = getAdminDecisionBadge(request.adminDecision && request.adminDecision !== 'Pending' ? request.adminDecision : 'Pending');

    const requestedBy = request.requestedBy ? `${request.requestedBy.name} (${request.requestedBy.email})` : '?';
    const adminReviewer = request.adminReviewer ? `${request.adminReviewer.name} (${request.adminReviewer.email})` : '?';
    const logisticsSubmitter = request.logisticsSubmitter ? `${request.logisticsSubmitter.name} (${request.logisticsSubmitter.email})` : '?';
    const createdAt = request.createdAt ? new Date(request.createdAt).toLocaleString() : '?';
    const adminReviewedAt = request.adminReviewedAt ? new Date(request.adminReviewedAt).toLocaleString() : '?';
    const logisticsSubmittedAt = request.logisticsSubmittedAt ? new Date(request.logisticsSubmittedAt).toLocaleString() : '?';

    const itemsRows = (request.items || []).map(item => `
        <tr>
            <td>${item.itemName}</td>
            <td>${item.quantity}</td>
            <td>${item.justification || '?'}</td>
        </tr>
    `).join('');

    let vendorSection = '<p style="margin-top: 10px;">No vendor options submitted yet.</p>';

    if (request.vendorOptions && request.vendorOptions.length) {
        vendorSection = request.vendorOptions.map(option => {
            const optionItems = (option.items || []).map(item => `
                <tr>
                    <td>${item.itemName}</td>
                    <td>${item.quantity}</td>
                    <td>${formatCurrency(item.unitPrice)}</td>
                    <td>${formatCurrency(item.totalPrice)}</td>
                </tr>
            `).join('');

            const submittedAt = option.createdAt ? new Date(option.createdAt).toLocaleString() : '?';
            const submittedBy = option.submittedBy ? `${option.submittedBy.name} (${option.submittedBy.email})` : '?';

            return `
                <div class="card" style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div>
                            <strong>${option.vendorName}</strong>
                            <div class="text-muted" style="font-size: 0.85rem;">Submitted by ${submittedBy} ? ${submittedAt}</div>
                        </div>
                        <span class="badge badge-approved">${formatCurrency(option.totalPrice)}</span>
                    </div>
                    <table class="compact-table" style="width: 100%; margin-bottom: 10px;">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Qty</th>
                                <th>Unit Price</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${optionItems}
                        </tbody>
                    </table>
                    ${option.notes ? `<p><strong>Notes:</strong> ${option.notes}</p>` : ''}
                </div>
            `;
        }).join('');
    }

    return `
        <div style="margin-bottom: 20px;">
            <h3 style="margin-bottom: 8px;">${request.requestNumber}</h3>
            <p><strong>Title:</strong> ${request.title}</p>
            <p><strong>Status:</strong> ${statusBadge}</p>
            <p><strong>Admin Decision:</strong> ${adminDecisionBadge}</p>
            <p><strong>Requested By:</strong> ${requestedBy}</p>
            <p><strong>Admin Reviewer:</strong> ${adminReviewer}</p>
            <p><strong>Logistics Submitter:</strong> ${logisticsSubmitter}</p>
            <p><strong>Created:</strong> ${createdAt}</p>
            <p><strong>Admin Reviewed:</strong> ${adminReviewedAt}</p>
            <p><strong>Logistics Submitted:</strong> ${logisticsSubmittedAt}</p>
            ${request.poNumber ? `<p><strong>PO Number:</strong> ${request.poNumber}</p>` : ''}
            ${request.overallReason ? `<p style="margin-top: 12px;"><strong>Business Justification:</strong><br>${request.overallReason}</p>` : ''}
        </div>
        <h4 style="margin-bottom: 10px;">Requested Items</h4>
        <table style="width: 100%; margin-bottom: 20px;">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>Justification</th>
                </tr>
            </thead>
            <tbody>
                ${itemsRows}
            </tbody>
        </table>
        <h4 style="margin-bottom: 10px;">Vendor Options</h4>
        ${vendorSection}
    `;
}

async function openAdminReviewModal(requestId) {
    if (!currentUser || currentUser.role !== 'Admin') {
        return;
    }

    const request = await ensureProcurementRequest(requestId);
    if (!request) {
        showAlert('Unable to load procurement request for review.', 'error');
        return;
    }

    adminReviewRequestId = requestId;

    const decisionField = document.getElementById('admin-review-decision');
    const notesField = document.getElementById('admin-review-notes');

    if (decisionField) {
        const defaultDecision = request.status === 'Admin Hold' ? 'Hold' : 'Approved';
        decisionField.value = defaultDecision;
    }

    if (notesField) {
        notesField.value = request.adminNotes || '';
    }

    openModal('admin-review-request-modal');
}

async function submitAdminReview() {
    if (!adminReviewRequestId) {
        return;
    }

    const decisionField = document.getElementById('admin-review-decision');
    const notesField = document.getElementById('admin-review-notes');

    const decision = decisionField ? decisionField.value : 'Approved';
    const notes = notesField ? notesField.value.trim() : '';

    try {
        const response = await fetch(`/api/procurement-requests/${adminReviewRequestId}/admin-review`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ decision, notes })
        });

        const data = await response.json();

        if (response.ok) {
            showAlert(data.message || 'Decision recorded successfully', 'success');
            closeModal('admin-review-request-modal');
            adminReviewRequestId = null;
            await Promise.all([
                loadProcurementRequests(),
                loadStats()
            ]);
        } else {
            showAlert(data.message || 'Failed to record decision', 'error');
        }
    } catch (error) {
        console.error('Admin review submission error:', error);
        showAlert('Failed to record decision', 'error');
    }
}

async function openVendorOptionsModal(requestId) {
    if (!currentUser || currentUser.role !== 'Logistics') {
        return;
    }

    const request = await ensureProcurementRequest(requestId);
    if (!request) {
        showAlert('Unable to load procurement request details.', 'error');
        return;
    }

    if (!request.items || !request.items.length) {
        showAlert('This procurement request has no items.', 'error');
        return;
    }

    vendorOptionsRequestId = requestId;

    const content = document.getElementById('vendor-options-content');
    if (!content) {
        return;
    }

    content.innerHTML = buildVendorOptionsForm(request);
    [0, 1, 2].forEach(index => updateVendorTotal(index));
    openModal('vendor-options-modal');
}

function buildVendorOptionsForm(request) {
    const overview = `
        <div style="margin-bottom: 20px;">
            <h3 style="margin-bottom: 6px;">${request.requestNumber}</h3>
            <p style="margin-bottom: 4px;"><strong>Title:</strong> ${request.title}</p>
            <p style="margin-bottom: 4px;"><strong>Status:</strong> ${getProcurementStatusBadge(request.status)}</p>
            <p style="margin-bottom: 4px;"><strong>Requested By:</strong> ${request.requestedBy ? request.requestedBy.name : '?'}</p>
            ${request.overallReason ? `<p style="margin-top: 10px;"><strong>Business Justification:</strong> ${request.overallReason}</p>` : ''}
        </div>
    `;

    const itemsTable = `
        <table class="compact-table" style="width: 100%; margin-bottom: 24px;">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>Justification</th>
                </tr>
            </thead>
            <tbody>
                ${(request.items || []).map(item => `
                    <tr>
                        <td>${item.itemName}</td>
                        <td>${item.quantity}</td>
                        <td>${item.justification || '?'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    const vendorCards = [0, 1, 2].map(index => {
        const existingOption = request.vendorOptions && request.vendorOptions[index] ? request.vendorOptions[index] : null;
        const vendorName = existingOption ? existingOption.vendorName : '';
        const notes = existingOption && existingOption.notes ? existingOption.notes : '';
        const itemPricing = {};

        if (existingOption && existingOption.items) {
            existingOption.items.forEach(item => {
                itemPricing[item.requestItemId] = item;
            });
        }

        const pricingRows = (request.items || []).map(item => {
            const existing = itemPricing[item.id] || {};
            const unitPrice = existing.unitPrice !== undefined ? existing.unitPrice : '';

            return `
                <tr>
                    <td>${item.itemName}</td>
                    <td>${item.quantity}</td>
                    <td>
                        <input type="number" class="vendor-item-unit-price" data-index="${index}" data-item-id="${item.id}" data-quantity="${item.quantity}" min="0" step="0.01" value="${unitPrice}" oninput="updateVendorTotal(${index})">
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="card" style="margin-bottom: 20px;">
                <div class="form-group" style="margin-bottom: 16px;">
                    <label>Vendor ${index + 1} Name *</label>
                    <input type="text" class="vendor-option-name" data-index="${index}" placeholder="Vendor name" value="${vendorName}">
                </div>
                <table class="compact-table" style="width: 100%; margin-bottom: 16px;">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pricingRows}
                    </tbody>
                </table>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label>Notes</label>
                    <textarea class="vendor-option-notes" data-index="${index}" rows="2" placeholder="Optional notes">${notes}</textarea>
                </div>
                <div style="display: flex; justify-content: flex-end; font-weight: 600;">
                    Total: <span class="vendor-total" data-index="${index}" style="margin-left: 6px;">${formatCurrency(existingOption ? existingOption.totalPrice : 0)}</span>
                </div>
            </div>
        `;
    }).join('');

    return `${overview}${itemsTable}${vendorCards}`;
}

function updateVendorTotal(index) {
    const inputs = document.querySelectorAll(`.vendor-item-unit-price[data-index="${index}"]`);
    let total = 0;
    inputs.forEach(input => {
        const quantity = Number(input.dataset.quantity || 0);
        const unitPrice = Number.parseFloat(input.value);
        if (Number.isFinite(quantity) && Number.isFinite(unitPrice)) {
            total += quantity * unitPrice;
        }
    });

    const totalElement = document.querySelector(`.vendor-total[data-index="${index}"]`);
    if (totalElement) {
        totalElement.textContent = formatCurrency(total);
    }
}

async function submitVendorOptions() {
    if (!vendorOptionsRequestId) {
        return;
    }

    const request = await ensureProcurementRequest(vendorOptionsRequestId);
    if (!request) {
        showAlert('Unable to load procurement request details.', 'error');
        return;
    }

    const vendors = [];

    for (let index = 0; index < 3; index += 1) {
        const nameInput = document.querySelector(`.vendor-option-name[data-index="${index}"]`);
        const notesInput = document.querySelector(`.vendor-option-notes[data-index="${index}"]`);
        const pricingInputs = document.querySelectorAll(`.vendor-item-unit-price[data-index="${index}"]`);

        const vendorName = nameInput ? nameInput.value.trim() : '';
        if (!vendorName) {
            showAlert('Each vendor must have a name.', 'error');
            return;
        }

        const vendorItems = [];
        for (const input of pricingInputs) {
            const requestItemId = Number(input.dataset.itemId);
            const unitPrice = Number.parseFloat(input.value);

            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                showAlert('Unit prices must be zero or greater for all vendor quotes.', 'error');
                return;
            }

            vendorItems.push({
                requestItemId,
                unitPrice
            });
        }

        vendors.push({
            vendorName,
            notes: notesInput ? notesInput.value.trim() : '',
            items: vendorItems
        });
    }

    try {
        const response = await fetch(`/api/procurement-requests/${vendorOptionsRequestId}/vendor-options`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ vendors })
        });

        const data = await response.json();

        if (response.ok) {
            showAlert(data.message || 'Vendor options submitted successfully', 'success');
            closeModal('vendor-options-modal');
            vendorOptionsRequestId = null;
            await Promise.all([
                loadProcurementRequests(),
                loadStats()
            ]);
        } else {
            showAlert(data.message || 'Failed to submit vendor options', 'error');
        }
    } catch (error) {
        console.error('Vendor option submission error:', error);
        showAlert('Failed to submit vendor options', 'error');
    }
}

async function openSelectVendorModal(requestId) {
    if (!currentUser || currentUser.role !== 'Admin') {
        return;
    }

    const request = await ensureProcurementRequest(requestId);
    if (!request) {
        showAlert('Unable to load procurement request.', 'error');
        return;
    }

    if (!request.vendorOptions || !request.vendorOptions.length) {
        showAlert('Vendor options are not available yet.', 'error');
        return;
    }

    vendorSelectionRequestId = requestId;
    selectedVendorOptionId = request.selectedVendorOptionId || null;

    const content = document.getElementById('select-vendor-content');
    if (!content) {
        return;
    }

    content.innerHTML = buildVendorSelectionContent(request);
    openModal('select-vendor-modal');
}

function buildVendorSelectionContent(request) {
    const overview = `
        <div style=\"margin-bottom: 20px;\">
            <h3 style=\"margin-bottom: 6px;\">${request.requestNumber}</h3>
            <p style=\"margin-bottom: 4px;\"><strong>Title:</strong> ${request.title}</p>
            <p style=\"margin-bottom: 4px;\"><strong>Status:</strong> ${getProcurementStatusBadge(request.status)}</p>
            <p style=\"margin-bottom: 4px;\"><strong>Requested By:</strong> ${request.requestedBy ? request.requestedBy.name : '?'}</p>
            ${request.overallReason ? `<p style=\"margin-top: 10px;\"><strong>Business Justification:</strong> ${request.overallReason}</p>` : ''}
        </div>
    `;

    const cards = (request.vendorOptions || []).map(option => {
        const optionItems = (option.items || []).map(item => `
            <tr>
                <td>${item.itemName}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.unitPrice)}</td>
                <td>${formatCurrency(item.totalPrice)}</td>
            </tr>
        `).join('');

        const submittedAt = option.createdAt ? new Date(option.createdAt).toLocaleString() : '?';
        const submittedBy = option.submittedBy ? `${option.submittedBy.name} (${option.submittedBy.email})` : '?';
        const checked = selectedVendorOptionId && option.id === selectedVendorOptionId ? 'checked' : '';

        return `
            <div class=\"card\" style=\"margin-bottom: 16px;\">
                <div style=\"display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;\">
                    <label style=\"display: flex; align-items: center; gap: 10px; font-weight: 600;\">
                        <input type=\"radio\" name=\"vendor-selection\" value=\"${option.id}\" ${checked}>
                        ${option.vendorName}
                    </label>
                    <span class=\"badge badge-approved\">${formatCurrency(option.totalPrice)}</span>
                </div>
                <div class=\"text-muted\" style=\"font-size: 0.85rem; margin-bottom: 10px;\">
                    Submitted by ${submittedBy} ? ${submittedAt}
                </div>
                <table class=\"compact-table\" style=\"width: 100%; margin-bottom: 10px;\">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${optionItems}
                    </tbody>
                </table>
                ${option.notes ? `<p><strong>Notes:</strong> ${option.notes}</p>` : ''}
            </div>
        `;
    }).join('');

    return `${overview}${cards}`;
}

async function submitVendorSelection() {
    if (!vendorSelectionRequestId) {
        return;
    }

    const selectedRadio = document.querySelector('input[name="vendor-selection"]:checked');
    if (!selectedRadio) {
        showAlert('Select a vendor to continue.', 'error');
        return;
    }

    const vendorOptionId = Number(selectedRadio.value);

    try {
        const response = await fetch(`/api/procurement-requests/${vendorSelectionRequestId}/select-vendor`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ vendorOptionId })
        });

        const data = await response.json();

        if (response.ok) {
            showAlert(data.message || 'Purchase order created successfully', 'success');
            closeModal('select-vendor-modal');
            vendorSelectionRequestId = null;
            selectedVendorOptionId = null;
            await Promise.all([
                loadProcurementRequests(),
                loadPurchaseOrders(),
                loadStats()
            ]);
        } else {
            showAlert(data.message || 'Failed to create purchase order', 'error');
        }
    } catch (error) {
        console.error('Vendor selection error:', error);
        showAlert('Failed to create purchase order', 'error');
    }
}

// View PO details
async function viewPODetails(poId) {
    try {
        const response = await fetch(`/api/purchase-orders/${poId}`);
        const data = await response.json();
        
        if (data.success) {
            const po = data.purchaseOrder;
            const items = data.items;
            const poStatus = normalizeReviewStatus(po.status);
            const paymentStatusDisplay = po.payment_status || 'Not Paid';
            const deliveryStatusDisplay = normalizeDeliveryStatus(po.delivery_status);
            const statusClass = poStatus.toLowerCase().replace(/\s+/g, '-');
            const paymentClass = paymentStatusDisplay.toLowerCase().replace(/\s+/g, '-');
            const deliveryClass = deliveryStatusDisplay.toLowerCase().replace(/\s+/g, '-');
            
            const itemsHTML = items.map(item => `
                <tr>
                    <td>${item.item_name}</td>
                    <td>${item.quantity}</td>
                    <td>${formatCurrency(item.unit_price)}</td>
                    <td>${formatCurrency(item.total_price)}</td>
                </tr>
            `).join('');
            
            document.getElementById('po-details-content').innerHTML = `
                <div style="margin-bottom: 20px;">
                    <h3 style="margin-bottom: 10px;">PO #${po.po_number}</h3>
                    <p><strong>Vendor:</strong> ${po.vendor_name}</p>
                    <p><strong>Status:</strong> <span class="badge badge-${statusClass}">${poStatus}</span></p>
                    <p><strong>Payment:</strong> <span class="badge badge-${paymentClass}">${paymentStatusDisplay}</span></p>
                    <p><strong>Delivery:</strong> <span class="badge badge-${deliveryClass}">${deliveryStatusDisplay}</span></p>
                    <p><strong>Created By:</strong> ${po.created_by} (${po.created_by_email})</p>
                    <p><strong>Created:</strong> ${new Date(po.created_at).toLocaleString()}</p>
                    ${po.description ? `<p><strong>Description:</strong> ${po.description}</p>` : ''}
                </div>
                
                <h4 style="margin-bottom: 15px;">Items</h4>
                <table style="width: 100%;">
                    <thead>
                        <tr>
                            <th>Item Name</th>
                            <th>Quantity</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHTML}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="3" style="text-align: right; font-weight: bold;">Total Amount:</td>
                            <td style="font-weight: bold;">${formatCurrency(po.total_amount)}</td>
                        </tr>
                    </tfoot>
                </table>
            `;
            
            openModal('po-details-modal');
        }
    } catch (error) {
        console.error('Failed to load PO details:', error);
        showAlert('Failed to load PO details', 'error');
    }
}

// Open review modal (Head of Department)
function openReviewModal(poId, currentStatus = null) {
    selectedPOId = poId;
    const statusSelect = document.getElementById('review-status');
    const allowedOptions = ['Approved', 'Rejected', 'Hold'];
    const fallback = 'Approved';
    const targetStatus = allowedOptions.includes(currentStatus) ? currentStatus : fallback;
    statusSelect.value = targetStatus;
    document.getElementById('review-notes').value = '';
    openModal('review-modal');
}

// Submit review
async function submitReview() {
    const status = document.getElementById('review-status').value;
    const notes = document.getElementById('review-notes').value;
    
    try {
        const response = await fetch(`/api/purchase-orders/${selectedPOId}/review`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status, notes })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAlert(data.message, 'success');
            closeModal('review-modal');
            await loadDashboard();
        } else {
            showAlert(data.message || 'Failed to submit review', 'error');
        }
    } catch (error) {
        console.error('Review submission failed:', error);
        showAlert('Failed to submit review', 'error');
    }
}

// Open payment modal (Finance)
function openPaymentModal(poId, currentStatus = 'Not Paid') {
    selectedPOId = poId;
    const statusSelect = document.getElementById('payment-status');
    const allowedOptions = ['Not Paid', 'Partially Paid', 'Paid'];
    statusSelect.value = allowedOptions.includes(currentStatus) ? currentStatus : 'Not Paid';
    document.getElementById('payment-notes').value = '';
    openModal('payment-modal');
}

// Submit payment update
async function submitPaymentUpdate() {
    const paymentStatus = document.getElementById('payment-status').value;
    const notes = document.getElementById('payment-notes').value;
    
    try {
        const response = await fetch(`/api/purchase-orders/${selectedPOId}/payment`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ paymentStatus, notes })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAlert(data.message, 'success');
            closeModal('payment-modal');
            await loadDashboard();
        } else {
            showAlert(data.message || 'Failed to update payment status', 'error');
        }
    } catch (error) {
        console.error('Payment update failed:', error);
        showAlert('Failed to update payment status', 'error');
    }
}

// Open delivery modal (Stores)
function openDeliveryModal(poId, currentStatus = 'Not Received') {
    selectedPOId = poId;
    const statusSelect = document.getElementById('delivery-status');
    const allowedOptions = ['Not Received', 'Partially Received', 'Received Delivery'];
    statusSelect.value = allowedOptions.includes(currentStatus) ? currentStatus : 'Not Received';
    document.getElementById('delivery-notes').value = '';
    openModal('delivery-modal');
}

// Submit delivery update
async function submitDeliveryUpdate() {
    const deliveryStatus = document.getElementById('delivery-status').value;
    const notes = document.getElementById('delivery-notes').value;
    
    try {
        const response = await fetch(`/api/purchase-orders/${selectedPOId}/delivery`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ deliveryStatus, notes })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAlert(data.message, 'success');
            closeModal('delivery-modal');
            await loadDashboard();
        } else {
            showAlert(data.message || 'Failed to update delivery status', 'error');
        }
    } catch (error) {
        console.error('Delivery update failed:', error);
        showAlert('Failed to update delivery status', 'error');
    }
}

// Modal utilities
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Alert utility
function showAlert(message, type = 'error') {
    const alertContainer = document.getElementById('alert-container');
    alertContainer.innerHTML = `
        <div class="alert alert-${type}">
            ${message}
        </div>
    `;
    
    setTimeout(() => {
        alertContainer.innerHTML = '';
    }, 5000);
}

// Logout
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Logout failed:', error);
    }
}
