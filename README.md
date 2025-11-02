# Zentrove

A professional, multi-tenant Purchase Order tracking web application with strict data isolation, role-based access control, and comprehensive workflow management.

## Features

### 🔐 Multi-Tenant Architecture
- **Strict Data Isolation**: Each organization's data is completely separated
- **Organization Management**: Users can create new organizations or join existing ones
- **Secure Authentication**: Email + password login with bcrypt password hashing

### 👥 Role-Based Access Control

#### **Logistics**
- Create and submit purchase orders
- View status of submitted POs (Approved/Rejected/Hold)
- View delivery status for approved POs

#### **Head of Department**
- Review POs submitted by Logistics
- Approve, Reject, or Hold POs
- View payment and delivery status

#### **Finance**
- Access only approved POs
- Update payment status (Paid/Partially Paid/Not Paid)

#### **Stores**
- Update delivery status for approved POs
- Track deliveries (Received Delivery/Partially Received/Not Received)

#### **Admin**
- Manage employee accounts
- Assign and change user roles
- Reset passwords
- Activate/deactivate users

### 🔄 Complete Workflow
```
Head of Department (Request) → Admin (Review) → Logistics (Vendor Quotes) → Admin (Vendor Selection & PO) → Finance (Payment) → Stores (Delivery) → Complete
```

### 🎨 Modern UI/UX
- Clean, professional dashboard
- Intuitive navigation with sidebar
- Status badges and color-coded indicators
- Responsive tables and modals
- Real-time statistics
- Professional gradient design

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js + Express
- **Database**: MySQL
- **Authentication**: Express Session + bcrypt
- **Security**: Parameterized queries, CORS, input validation

## Prerequisites

- Node.js (v14 or higher)
- MySQL (v5.7 or higher)
- npm or yarn

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd zentrove
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up MySQL Database

Create a MySQL database:

```sql
CREATE DATABASE zentrove;
```

Import the schema:

```bash
mysql -u root -p zentrove < database/schema.sql
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=po_tracking

PORT=3000
SESSION_SECRET=your-secret-key-change-this-in-production

NODE_ENV=development
```

### 5. Start the Server

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

The application will be available at: `http://localhost:3000`

## Usage

### First-Time Setup

1. **Navigate to Signup**: Go to `http://localhost:3000/signup`

2. **Create Organization**: 
   - Select "Create New"
   - Enter organization name
   - Fill in your details
   - Select your role
   - Save your Organization ID for inviting team members

3. **Invite Team Members**:
   - Share your Organization ID with team members
   - They select "Join Existing" during signup
   - Enter the Organization ID to join your organization

### Demo Accounts

The system includes pre-configured demo accounts (password: `password123`):

- **Logistics**: logistics@demo.com
- **Head of Department**: management@demo.com
- **Finance**: finance@demo.com
- **Stores**: store@demo.com
- **Admin**: admin@demo.com

**Organization ID**: `ORG-DEMO-001`

⚠️ **Important**: Change these passwords in production!

### Workflow Example

1. **Head of Department** submits a procurement request detailing items and justification
2. **Admin** reviews the request and either approves, rejects, or places it on hold
3. **Logistics** researches and submits the top three vendor quotes for the approved request
4. **Admin** selects the preferred vendor, automatically generating the purchase order
5. **Finance** records payment progress on the new PO
6. **Stores** confirms delivery status once goods arrive

## Database Schema

### Tables

- **organizations**: Organization details
- **users**: User accounts with role-based access
- **purchase_orders**: Main PO records
- **po_items**: Line items for each PO
- **payment_updates**: Payment status audit trail
- **delivery_updates**: Delivery status audit trail
- **audit_logs**: System-wide audit logging

### Key Security Features

- Every query includes `org_id` filtering for data isolation
- Parameterized queries prevent SQL injection
- Password hashing with bcrypt (10 rounds)
- Session-based authentication
- Role-based middleware for endpoint protection

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/check` - Check session status

### Purchase Orders
- `POST /api/purchase-orders` - Create PO (Logistics)
- `GET /api/purchase-orders` - List POs (filtered by role)
- `GET /api/purchase-orders/:id` - Get PO details
- `PATCH /api/purchase-orders/:id/review` - Review PO (Head of Department)
- `PATCH /api/purchase-orders/:id/payment` - Update payment (Finance)
- `PATCH /api/purchase-orders/:id/delivery` - Update delivery (Stores)

### User Management
- `GET /api/users` - List organization users (Admin)
- `PATCH /api/users/:id/role` - Change user role (Admin)
- `PATCH /api/users/:id/status` - Activate/deactivate user (Admin)
- `PATCH /api/users/:id/password` - Reset password (Admin)

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

## File Structure

```
po-tracking-system/
├── config/
│   └── database.js          # Database configuration
├── database/
│   └── schema.sql           # Database schema
├── middleware/
│   └── auth.js              # Authentication middleware
├── public/
│   ├── admin.html           # Admin panel
│   ├── create-po.html       # Create PO page
│   ├── dashboard.html       # Main dashboard
│   ├── dashboard.js         # Dashboard logic
│   ├── login.html           # Login page
│   ├── signup.html          # Signup page
│   └── styles.css           # Global styles
├── routes/
│   ├── auth.js              # Authentication routes
│   ├── dashboard.js         # Dashboard routes
│   ├── purchase-orders.js   # PO routes
│   └── users.js             # User management routes
├── .env.example             # Environment variables template
├── package.json             # Dependencies
├── server.js                # Main server file
└── README.md                # Documentation
```

## Security Best Practices

1. **Environment Variables**: Never commit `.env` file
2. **Password Strength**: Enforce strong passwords in production
3. **Session Secret**: Use a strong, random session secret
4. **HTTPS**: Use HTTPS in production
5. **Database**: Limit database user permissions
6. **Input Validation**: All inputs are validated server-side
7. **SQL Injection**: Parameterized queries throughout
8. **XSS Protection**: Proper output encoding

## Deployment

### Production Checklist

- [ ] Change all default passwords
- [ ] Set strong `SESSION_SECRET`
- [ ] Use HTTPS/SSL certificates
- [ ] Set `NODE_ENV=production`
- [ ] Configure proper database backups
- [ ] Enable MySQL query logging
- [ ] Set up monitoring and alerts
- [ ] Configure CORS for specific domains
- [ ] Review and harden server security
- [ ] Set up rate limiting

### Recommended Hosting

- **Backend**: AWS EC2, DigitalOcean, Heroku
- **Database**: AWS RDS, MySQL managed service
- **Frontend**: Can be served from the same Node server

## Troubleshooting

### Database Connection Issues
- Verify MySQL is running
- Check credentials in `.env`
- Ensure database exists and schema is imported

### Session Issues
- Clear browser cookies
- Check `SESSION_SECRET` is set
- Verify session middleware configuration

### Permission Errors
- Confirm user role is correct
- Check middleware is applied to routes
- Review audit logs for access attempts

## Future Enhancements

- Email notifications for workflow events
- File attachments for POs
- Advanced reporting and analytics
- Export to PDF/Excel
- Multi-factor authentication
- Real-time updates with WebSockets
- Mobile app

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review audit logs in the database
3. Check server console for errors

## License

ISC License

## Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Built with ❤️ for efficient purchase order management**
