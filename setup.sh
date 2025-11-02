#!/bin/bash

echo "========================================="
echo "Zentrove - Setup Script"
echo "========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null
then
    echo "❌ Node.js is not installed. Please install Node.js v14 or higher."
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check if MySQL is installed
if ! command -v mysql &> /dev/null
then
    echo "❌ MySQL is not installed. Please install MySQL v5.7 or higher."
    exit 1
fi

echo "✅ MySQL found"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Check if .env exists
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your database credentials"
    echo ""
    read -p "Press Enter to continue after editing .env..."
fi

# Source .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Create database
echo ""
echo "🗄️  Setting up database..."
read -p "Enter MySQL root password: " -s MYSQL_PASSWORD
echo ""

mysql -u root -p$MYSQL_PASSWORD -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Database created/verified"
else
    echo "❌ Failed to create database. Please check your MySQL credentials."
    exit 1
fi

# Import schema
echo "📋 Importing database schema..."
mysql -u root -p$MYSQL_PASSWORD $DB_NAME < database/schema.sql 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Schema imported successfully"
else
    echo "❌ Failed to import schema"
    exit 1
fi

echo ""
echo "========================================="
echo "✅ Setup completed successfully!"
echo "========================================="
echo ""
echo "To start the server:"
echo "  npm start"
echo ""
echo "To start in development mode:"
echo "  npm run dev"
echo ""
echo "The application will be available at:"
echo "  http://localhost:$PORT"
echo ""
echo "Demo accounts (password: password123):"
echo "  - logistics@demo.com (Logistics)"
echo "  - management@demo.com (Head of Department)"
echo "  - finance@demo.com (Finance)"
echo "  - store@demo.com (Stores)"
echo "  - admin@demo.com (Admin)"
echo ""
echo "Organization ID: ORG-DEMO-001"
echo ""
