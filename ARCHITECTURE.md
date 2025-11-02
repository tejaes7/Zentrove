# System Architecture

## Overview

Zentrove is built using a three-tier architecture with multi-tenant data isolation.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│                      (Web Browser)                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Login   │  │  Signup  │  │Dashboard │  │  Admin   │   │
│  │   Page   │  │   Page   │  │   Page   │  │   Panel  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│       HTML + CSS + JavaScript (Vanilla JS)                   │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTPS/REST API
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│                  (Node.js + Express)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Middleware Stack                       │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │   │
│  │  │   Session    │→ │     Auth     │→ │   CORS   │ │   │
│  │  │  Management  │  │ Middleware   │  │          │ │   │
│  │  └──────────────┘  └──────────────┘  └──────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Route Handlers                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────┐│   │
│  │  │   Auth   │  │    PO    │  │   User   │  │Dash ││   │
│  │  │  Routes  │  │  Routes  │  │  Routes  │  │board││   │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────┘│   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕ MySQL Protocol
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                              │
│                     (MySQL Database)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Multi-Tenant Tables (all filtered by org_id)      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │   │
│  │  │Organizations │  │    Users     │  │    POs   │ │   │
│  │  └──────────────┘  └──────────────┘  └──────────┘ │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │   │
│  │  │  PO Items    │  │   Payment    │  │ Delivery │ │   │
│  │  └──────────────┘  │   Updates    │  │  Updates │ │   │
│  │                     └──────────────┘  └──────────┘ │   │
│  │  ┌──────────────┐                                  │   │
│  │  │ Audit Logs   │                                  │   │
│  │  └──────────────┘                                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Request Flow

### 1. Authentication Flow

```
User enters credentials
        ↓
   Login Form Submit
        ↓
POST /api/auth/login
        ↓
   Verify email exists
        ↓
  Check user is active
        ↓
   Validate password (bcrypt)
        ↓
  Create session with:
  - userId
  - orgId
  - role
  - email
        ↓
   Return success
        ↓
 Redirect to dashboard
```

### 2. Purchase Order Creation Flow

```
Logistics User
        ↓
  Fill PO Form (vendor + items)
        ↓
POST /api/purchase-orders
        ↓
  Check Auth Middleware
  (session exists?)
        ↓
  Check Role Middleware
  (role === 'Logistics'?)
        ↓
  Start Transaction
        ↓
  Generate PO Number
        ↓
  Insert PO (with org_id)
        ↓
  Insert Items
        ↓
  Log to Audit Trail
        ↓
  Commit Transaction
        ↓
  Return Success
```

### 3. PO Review Flow (Head of Department)

```
Head of Department User
        ↓
  View PO in dashboard
        ↓
  Click "Review"
        ↓
  Select: Approve/Reject/Hold
        ↓
PATCH /api/purchase-orders/:id/review
        ↓
  Check Auth (session exists?)
        ↓
  Check Role (role === 'Head of Department'?)
        ↓
  Verify PO exists
  WHERE id = :id AND org_id = session.orgId
        ↓
  Check PO status is 'Pending'
        ↓
  Update PO status
        ↓
  Log to Audit Trail
        ↓
  Return Success
        ↓
  Dashboard updates
```

## Multi-Tenant Isolation

### Every Query Pattern

```sql
-- WRONG (no tenant isolation)
SELECT * FROM purchase_orders WHERE id = ?

-- CORRECT (tenant isolated)
SELECT * FROM purchase_orders 
WHERE id = ? AND org_id = ?
```

### Three-Level Protection

1. **Session Level**
   - User's orgId stored in session
   - Automatically available in all requests

2. **Query Level**
   - Every query includes org_id filter
   - Impossible to access other org's data

3. **Database Level**
   - Foreign key constraints
   - Ensures data integrity

## Role-Based Access Control

### Middleware Stack

```
Request
   ↓
requireAuth()  ← Check session exists
   ↓
requireRole(['Head of Department'])  ← Check user has required role
   ↓
Route Handler
```

### Permission Matrix

| Feature                  | Logistics | Head of Department | Finance | Stores | Admin |
|-------------------------|-----------|---------------------|---------|--------|-------|
| Create PO               | ✅        | ❌                  | ❌      | ❌     | ❌    |
| View Own POs            | ✅        | ❌                  | ❌      | ❌     | ❌    |
| View All POs            | ❌        | ✅                  | ❌      | ❌     | ✅    |
| View Approved POs       | ❌        | ✅                  | ✅      | ✅     | ✅    |
| Review PO               | ❌        | ✅                  | ❌      | ❌     | ❌    |
| Update Payment          | ❌        | ❌                  | ✅      | ❌     | ❌    |
| Update Delivery         | ❌        | ❌                  | ❌      | ✅     | ❌    |
| Manage Users            | ❌        | ❌                  | ❌      | ❌     | ✅    |

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐
│ Organizations   │
│                 │
│ - id (PK)       │
│ - org_id (UK)   │─┐
│ - name          │ │
└─────────────────┘ │
                    │
        ┌───────────┴────────────────────┐
        │                                │
        ↓                                ↓
┌─────────────────┐            ┌─────────────────┐
│     Users       │            │ Purchase Orders │
│                 │            │                 │
│ - id (PK)       │──┐      ┌──│ - id (PK)       │
│ - org_id (FK)   │  │      │  │ - org_id (FK)   │
│ - email         │  │      │  │ - po_number     │
│ - password_hash │  │      │  │ - vendor_name   │
│ - role          │  │      │  │ - total_amount  │
│ - is_active     │  │      │  │ - status        │
└─────────────────┘  │      │  │ - payment_st... │
                     │      │  │ - delivery_st...│
                     │      │  │ - created_by(FK)│
                     │      │  │ - reviewed_by   │
                     ↓      ↓  └─────────────────┘
              created_by  reviewed_by       │
                                             │
                 ┌───────────────────────────┼──────────────┐
                 ↓                           ↓              ↓
         ┌─────────────┐         ┌─────────────────┐ ┌─────────────┐
         │  PO Items   │         │Payment Updates  │ │Delivery Upd.│
         │             │         │                 │ │             │
         │ - id (PK)   │         │ - id (PK)       │ │ - id (PK)   │
         │ - po_id(FK) │         │ - po_id (FK)    │ │ - po_id(FK) │
         │ - item_name │         │ - updated_by(FK)│ │ - updated...│
         │ - quantity  │         │ - old_status    │ │ - old_sta...│
         │ - unit_price│         │ - new_status    │ │ - new_sta...│
         │ - total_pr..│         │ - notes         │ │ - notes     │
         └─────────────┘         └─────────────────┘ └─────────────┘
```

## Security Architecture

### Defense in Depth

```
┌─────────────────────────────────────────────┐
│  Layer 1: Network Security                  │
│  - HTTPS/TLS (production)                   │
│  - CORS configuration                       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Layer 2: Session Security                  │
│  - HTTP-only cookies                        │
│  - Secure flag (production)                 │
│  - Session secret                           │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Layer 3: Authentication                    │
│  - Password hashing (bcrypt)                │
│  - Session validation                       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Layer 4: Authorization                     │
│  - Role-based middleware                    │
│  - Permission checks                        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Layer 5: Data Access                       │
│  - Multi-tenant filtering (org_id)          │
│  - Parameterized queries                    │
│  - Input validation                         │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Layer 6: Audit Trail                       │
│  - All actions logged                       │
│  - User tracking                            │
│  - IP logging                               │
└─────────────────────────────────────────────┘
```

## Workflow State Machine

```
                    ┌──────────────┐
                    │   Created    │
                    │  (Logistics) │
                    └──────┬───────┘
                           │
                           ↓
                    ┌──────────────┐
                    │   Pending    │
                    │ (Awaiting    │
                    │  Review)     │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ↓            ↓            ↓
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │ Rejected │ │  Hold    │ │ Approved │
      │  (End)   │ │ (Paused) │ │          │
      └──────────┘ └──────────┘ └────┬─────┘
                                       │
                           ┌───────────┴────────────┐
                           ↓                        ↓
                    ┌─────────────┐         ┌─────────────┐
                    │  Payment    │         │  Delivery   │
                    │   Status    │         │   Status    │
                    │             │         │             │
                    │ • Not Paid        │   │ • Not Received       │
                    │ • Partially Paid  │   │ • Partially Received │
                    │ • Paid            │   │ • Received Delivery  │
                    └─────────────┘         └─────────────┘
                           │                        │
                           └───────────┬────────────┘
                                      ↓
                              ┌──────────────┐
                              │   Complete   │
                              │ (Paid + Deliv│
                              └──────────────┘
```

## Scalability Considerations

### Current Architecture Supports

✅ **Multiple Organizations** - No limit  
✅ **Multiple Users per Org** - No limit  
✅ **Concurrent Requests** - Connection pooling  
✅ **Large POs** - Transaction support  
✅ **Audit Trail** - Efficient indexing  

### Scaling Options

1. **Horizontal Scaling**
   - Add more app servers
   - Load balancer in front
   - Shared session store (Redis)

2. **Database Scaling**
   - Read replicas
   - Query optimization
   - Table partitioning by org_id

3. **Caching Layer**
   - Redis for sessions
   - Cache dashboard stats
   - Cache user permissions

## Technology Stack Details

### Frontend
- **Vanilla JavaScript** - No framework overhead
- **CSS3** - Modern styling with gradients
- **HTML5** - Semantic markup
- **Fetch API** - AJAX requests

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **mysql2** - MySQL driver with promises
- **bcrypt** - Password hashing
- **express-session** - Session management
- **dotenv** - Environment configuration

### Database
- **MySQL 5.7+** - Relational database
- **InnoDB** - Storage engine
- **UTF-8** - Character encoding
- **Foreign Keys** - Referential integrity

## Performance Optimizations

✅ Connection pooling for database  
✅ Indexed queries (org_id, id)  
✅ Minimal frontend dependencies  
✅ Efficient SQL queries  
✅ Session store in memory (upgradeable to Redis)  
✅ Static file serving  
✅ Transaction support for data integrity  

---

**Architecture Status: Production Ready**
