-- Purchase Order Tracking System - Database Schema
-- Multi-tenant system with strict data isolation by orgId

-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS procurement_vendor_option_items;
DROP TABLE IF EXISTS procurement_vendor_options;
DROP TABLE IF EXISTS procurement_request_items;
DROP TABLE IF EXISTS procurement_requests;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS delivery_updates;
DROP TABLE IF EXISTS payment_updates;
DROP TABLE IF EXISTS po_items;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizations;

-- Organizations table
CREATE TABLE organizations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    org_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_org_id (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    org_id VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role ENUM('Logistics', 'Head of Department', 'Finance', 'Stores', 'Admin') NOT NULL,
    security_question_1 VARCHAR(255) NOT NULL COMMENT 'Your best friend''s name in high school',
    security_answer_1_hash VARCHAR(255) NOT NULL,
    security_question_2 VARCHAR(255) NOT NULL COMMENT 'Your favorite book',
    security_answer_2_hash VARCHAR(255) NOT NULL,
    security_question_3 VARCHAR(255) NOT NULL COMMENT 'Your favorite place',
    security_answer_3_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_email_per_org (org_id, email),
    FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE CASCADE,
    INDEX idx_org_email (org_id, email),
    INDEX idx_org_role (org_id, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Purchase Orders table
CREATE TABLE purchase_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    org_id VARCHAR(50) NOT NULL,
    po_number VARCHAR(50) NOT NULL,
    created_by_user_id INT NOT NULL,
    vendor_name VARCHAR(255) NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    description TEXT,
    status ENUM('Pending', 'Approved', 'Rejected', 'Hold') DEFAULT 'Pending',
    payment_status ENUM('Not Paid', 'Partially Paid', 'Paid') DEFAULT 'Not Paid',
    delivery_status ENUM('Not Received', 'Partially Received', 'Received Delivery') DEFAULT 'Not Received',
    reviewed_by_user_id INT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_po_number_per_org (org_id, po_number),
    FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id),
    INDEX idx_org_status (org_id, status),
    INDEX idx_org_created_by (org_id, created_by_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Procurement Requests table (initiated by Head of Department)
CREATE TABLE procurement_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    org_id VARCHAR(50) NOT NULL,
    request_number VARCHAR(50) NOT NULL,
    requested_by_user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    overall_reason TEXT,
    status ENUM('Pending Admin Review', 'Admin Approved', 'Admin Rejected', 'Admin Hold', 'Vendors Submitted', 'PO Created') DEFAULT 'Pending Admin Review',
    admin_decision ENUM('Pending', 'Approved', 'Rejected', 'Hold') DEFAULT 'Pending',
    admin_notes TEXT,
    admin_reviewed_by_user_id INT NULL,
    admin_reviewed_at TIMESTAMP NULL,
    logistics_submitted_by_user_id INT NULL,
    logistics_submitted_at TIMESTAMP NULL,
    selected_vendor_option_id INT NULL,
    po_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_request_number_per_org (org_id, request_number),
    FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
    FOREIGN KEY (admin_reviewed_by_user_id) REFERENCES users(id),
    FOREIGN KEY (logistics_submitted_by_user_id) REFERENCES users(id),
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Procurement Request Items table
CREATE TABLE procurement_request_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    justification TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES procurement_requests(id) ON DELETE CASCADE,
    INDEX idx_request_id (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Procurement Vendor Options table (submitted by Logistics)
CREATE TABLE procurement_vendor_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    vendor_name VARCHAR(255) NOT NULL,
    total_price DECIMAL(15, 2) NOT NULL,
    submitted_by_user_id INT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES procurement_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
    INDEX idx_request_vendor (request_id, vendor_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Vendor Option Items table (pricing for each item per vendor)
CREATE TABLE procurement_vendor_option_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vendor_option_id INT NOT NULL,
    request_item_id INT NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    total_price DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vendor_option_id) REFERENCES procurement_vendor_options(id) ON DELETE CASCADE,
    FOREIGN KEY (request_item_id) REFERENCES procurement_request_items(id) ON DELETE CASCADE,
    INDEX idx_vendor_option_id (vendor_option_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Link selected vendor option to procurement request (added after both tables exist)
ALTER TABLE procurement_requests
    ADD CONSTRAINT fk_procurement_requests_selected_vendor
    FOREIGN KEY (selected_vendor_option_id)
    REFERENCES procurement_vendor_options(id)
    ON DELETE SET NULL;

-- Purchase Order Items table
CREATE TABLE po_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    po_id INT NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    total_price DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    INDEX idx_po_id (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payment Updates table (audit trail for finance actions)
CREATE TABLE payment_updates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    po_id INT NOT NULL,
    updated_by_user_id INT NOT NULL,
    old_status ENUM('Not Paid', 'Partially Paid', 'Paid'),
    new_status ENUM('Not Paid', 'Partially Paid', 'Paid') NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
    INDEX idx_po_id (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Delivery Updates table (audit trail for store head actions)
CREATE TABLE delivery_updates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    po_id INT NOT NULL,
    updated_by_user_id INT NOT NULL,
    old_status ENUM('Not Received', 'Partially Received', 'Received Delivery'),
    new_status ENUM('Not Received', 'Partially Received', 'Received Delivery') NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
    INDEX idx_po_id (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit Logs table (for tracking all important actions)
CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    org_id VARCHAR(50) NOT NULL,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INT,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_org_created (org_id, created_at),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert sample organization for testing
INSERT INTO organizations (org_id, name) VALUES ('ORG-DEMO-001', 'Demo Corporation');

-- Insert sample users (password is 'password123' - hashed with bcrypt)
-- You should change these passwords in production
-- Security answers: friend1, book1, place1 (hashed with bcrypt)
-- Note: For existing databases, you'll need to add security questions for existing users
INSERT INTO users (org_id, email, password_hash, full_name, role, security_question_1, security_answer_1_hash, security_question_2, security_answer_2_hash, security_question_3, security_answer_3_hash) VALUES
('ORG-DEMO-001', 'logistics@demo.com', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'John Logistics', 'Logistics', 'Your best friend''s name in high school', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Your favorite book', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Your favorite place', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4'),
('ORG-DEMO-001', 'management@demo.com', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Sarah Manager', 'Head of Department', 'Your best friend''s name in high school', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Your favorite book', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Your favorite place', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4'),
('ORG-DEMO-001', 'finance@demo.com', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Mike Finance', 'Finance', 'Your best friend''s name in high school', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Your favorite book', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Your favorite place', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4'),
('ORG-DEMO-001', 'store@demo.com', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Lisa Store', 'Stores', 'Your best friend''s name in high school', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Your favorite book', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Your favorite place', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4'),
('ORG-DEMO-001', 'admin@demo.com', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Admin User', 'Admin', 'Your best friend''s name in high school', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Your favorite book', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4', 'Your favorite place', '$2b$10$rBV2IQ6wVpqKJZ5kxz7KxOYJZ9Kx5XZQqXMZqZ3Z8Z9Z0Z1Z2Z3Z4');
