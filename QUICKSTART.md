# Zentrove - Quick Start Guide

Get Zentrove up and running in 5 minutes!

## Prerequisites

- Node.js (v14+)
- MySQL (v5.7+)
- npm

## Installation Steps

### Option 1: Automated Setup (Recommended)

```bash
# Make setup script executable
chmod +x setup.sh

# Run setup script
./setup.sh
```

The script will:
- Install all dependencies
- Create the database
- Import the schema
- Configure the environment

### Option 2: Manual Setup

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your database credentials
```

#### 3. Create Database
```sql
CREATE DATABASE zentrove;
```

#### 4. Import Schema
```bash
mysql -u root -p zentrove < database/schema.sql
```

#### 5. Start Server
```bash
npm start
```

## First Login

### Using Demo Accounts

Navigate to: `http://localhost:3000`

**Demo Credentials** (password: `password123`)
- **Logistics**: logistics@demo.com
- **Head of Department**: management@demo.com
- **Finance**: finance@demo.com
- **Stores**: store@demo.com
- **Admin**: admin@demo.com

**Organization ID**: `ORG-DEMO-001`

### Creating Your Own Organization

1. Go to: `http://localhost:3000/signup`
2. Select "Create New" organization
3. Enter your organization name
4. Fill in your details and select role
5. Click "Create Account"
6. **Save your Organization ID** - you'll need it to invite team members!

## Basic Workflow

### 1. Logistics Creates PO
- Login as Logistics user
- Click "Create PO"
- Add vendor and items
- Submit

### 2. Head of Department Reviews
- Login as Head of Department user
- View pending POs
- Click "Review"
- Approve, Reject, or Hold

### 3. Finance Updates Payment
- Login as Finance user
- View approved POs
- Click "Payment"
- Update payment status

### 4. Stores Updates Delivery
- Login as Stores user
- View approved POs
- Click "Delivery"
- Update delivery status

## Admin Functions

Login as Admin to:
- View all users in your organization
- Change user roles
- Reset passwords
- Activate/deactivate users

## Troubleshooting

### Can't connect to database?
- Check MySQL is running: `sudo service mysql status`
- Verify credentials in `.env`
- Check database exists: `SHOW DATABASES;`

### Session errors?
- Clear browser cookies
- Check `SESSION_SECRET` in `.env`
- Restart the server

### Permission denied?
- Verify you're logged in with correct role
- Check user is active (Admin can reactivate)
- Try logging out and back in

## Next Steps

1. **Invite Team Members**
   - Share your Organization ID
   - They select "Join Existing" during signup

2. **Change Demo Passwords**
   - Login as Admin
   - Go to User Management
   - Reset passwords for all demo accounts

3. **Start Creating POs**
   - Login as Logistics
   - Create your first real purchase order

## Need Help?

- Check the full [README.md](README.md) for detailed documentation
- Review the API endpoints for integration
- Check server console for error messages

---

**Happy tracking! 🚀**
